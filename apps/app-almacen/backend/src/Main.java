import com.sun.net.httpserver.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.Executors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.security.MessageDigest;

/** Cliente Almacén: solo adapta HTTP, cookies y páginas; la seguridad reside en el Core. */
public class Main {
    private static final Path ROOT = Path.of("").toAbsolutePath();
    private static final Path FRONTEND = ROOT.getParent().resolve("frontend/dist").normalize();
    private static final String COOKIE = "st_demo_almacen_session";
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private static Map<String, Object> settings;
    private static String coreUrl;
    private static boolean secure;
    private record Reply(int status, Map<String, Object> body) {}

    @SuppressWarnings("unchecked")
    public static void main(String[] args) throws Exception {
        Config.load(ROOT);
        coreUrl = Config.get("CORE_URL");
        settings = Json.object(Files.readString(ROOT.resolve("app.json")));
        settings.put("id",Integer.valueOf(Config.get("APP_ID"))); settings.put("key",Config.get("APP_KEY"));
        settings.put("port",Integer.valueOf(Config.get("PORT")));
        secure = "true".equals(Config.get("COOKIE_SECURE"));
        int port = ((Number) settings.get("port")).intValue();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.createContext("/", Main::handle);
        server.start();
        System.out.println("Almacén: http://localhost:" + port);
    }
    private static String token(HttpExchange exchange) {
        String cookies = exchange.getRequestHeaders().getFirst("Cookie");
        if (cookies == null) return null;
        for (String part : cookies.split(";")) { String[] pair = part.trim().split("=", 2); if (pair.length == 2 && pair[0].equals(COOKIE) && pair[1].matches("[a-f0-9]{64}")) return pair[1]; }
        return null;
    }
    private static String csrf(String token) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(((String) settings.get("key")).getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(("csrf:" + token).getBytes(StandardCharsets.UTF_8)));
    }
    private static Reply upstream(HttpExchange exchange, String path, String method, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create(coreUrl + "/api/v1" + path)).timeout(Duration.ofSeconds(5))
            .header("X-App-Id", String.valueOf(((Number) settings.get("id")).intValue()))
            .header("X-App-Key", (String) settings.get("key")).header("Content-Type", "application/json");
        String token = token(exchange); if (token != null) builder.header("Authorization", "Bearer " + token);
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(Json.stringify(body)));
        HttpResponse<String> response = HTTP.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        return new Reply(response.statusCode(), Json.object(response.body()));
    }
    @SuppressWarnings("unchecked")
    private static Reply page(HttpExchange exchange, String route) throws Exception {
        for (Map<String, Object> page : (List<Map<String, Object>>) settings.get("pages")) {
            if (page.get("route").equals(route)) {
                Reply result = upstream(exchange, "/auth/introspect", "POST", Map.of("permission", page.get("code")));
                if(result.status!=200) return result;
                Map<String,Object> authorized=new LinkedHashMap<>(page);
                authorized.put("iam_user_id",((Map<String,Object>)result.body.get("session")).get("user_id"));
                return new Reply(200,authorized);
            }
        }
        return new Reply(404, Map.of("error", "Página no encontrada."));
    }
    private static void send(HttpExchange exchange, int status, Object body) throws Exception { bytes(exchange, status, Json.stringify(body).getBytes(StandardCharsets.UTF_8), "application/json; charset=utf-8"); }
    private static void bytes(HttpExchange exchange, int status, byte[] data, String type) throws Exception {
        exchange.getResponseHeaders().set("Content-Type", type); exchange.sendResponseHeaders(status, data.length);
        exchange.getResponseBody().write(data); exchange.close();
    }
    private static void cookie(HttpExchange exchange, String value, String expires) {
        exchange.getResponseHeaders().add("Set-Cookie", COOKIE + "=" + value + "; Path=/; HttpOnly; SameSite=Lax; Expires=" + expires + (secure ? "; Secure" : ""));
    }
    private static void handle(HttpExchange exchange) {
        String path = exchange.getRequestURI().getPath();
        String method = exchange.getRequestMethod();
        Headers headers = exchange.getResponseHeaders();
        headers.set("X-Content-Type-Options", "nosniff"); headers.set("X-Frame-Options", "DENY");
        headers.set("Referrer-Policy", "same-origin"); headers.set("Cache-Control", "no-store");
        headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
        try {
            int port = ((Number) settings.get("port")).intValue();
            String origin = exchange.getRequestHeaders().getFirst("Origin");
            String frontendPort=Config.get("FRONTEND_PORT");
            if (!method.equals("GET") && origin != null && !Set.of("http://localhost:" + port, "http://127.0.0.1:" + port,"http://localhost:"+frontendPort,"http://127.0.0.1:"+frontendPort).contains(origin)) { send(exchange, 403, Map.of("error", "Origen no permitido.")); return; }
            if (path.equals("/api/v1/public/config") && method.equals("GET")) {
                Reply reply = upstream(exchange, "/public/config", "GET", null);
                Map<String, Object> config = new LinkedHashMap<>(reply.body);
                config.putAll(Map.of("mode", "demo", "appName", settings.get("name"), "slug", "almacen", "color", settings.get("color"), "description", settings.get("description")));
                send(exchange, reply.status, config); return;
            }
            if (path.startsWith("/api/v1/auth/") && method.equals("POST")) {
                String endpoint = path.substring("/api/v1".length());
                if (!Set.of("/auth/login-step1", "/auth/login-step2", "/auth/mfa/enroll", "/auth/mfa/confirm", "/auth/select-role", "/auth/logout").contains(endpoint)) { send(exchange, 404, Map.of("error", "Endpoint no disponible.")); return; }
                if (endpoint.equals("/auth/logout")) {
                    String received = exchange.getRequestHeaders().getFirst("X-CSRF-Token");
                    if (token(exchange) == null || received == null || !MessageDigest.isEqual(csrf(token(exchange)).getBytes(StandardCharsets.UTF_8), received.getBytes(StandardCharsets.UTF_8))) { send(exchange, 403, Map.of("error", "Verificación de solicitud inválida.")); return; }
                }
                byte[] raw = exchange.getRequestBody().readNBytes(24577);
                if (raw.length > 24576) { send(exchange, 413, Map.of("error", "Solicitud demasiado grande.")); return; }
                Object body = Json.parse(new String(raw, StandardCharsets.UTF_8));
                Reply reply = upstream(exchange, endpoint, "POST", body);
                Map<String, Object> result = new LinkedHashMap<>(reply.body);
                String session = (String) result.remove("sessionToken");
                if (session != null) {
                    result.put("csrfToken", csrf(session));
                    cookie(exchange, session, DateTimeFormatter.RFC_1123_DATE_TIME.format(Instant.parse((String) result.get("expires_at")).atZone(ZoneOffset.UTC)));
                }
                if (endpoint.equals("/auth/logout")) cookie(exchange, "", "Thu, 01 Jan 1970 00:00:00 GMT");
                send(exchange, reply.status, result); return;
            }
            if (path.equals("/api/v1/me") && method.equals("GET")) {
                Reply reply = upstream(exchange, "/me", "GET", null);
                Map<String, Object> result = new LinkedHashMap<>(reply.body);
                if (reply.status == 200) result.put("csrfToken", csrf(token(exchange)));
                send(exchange, reply.status, result); return;
            }
            if (path.equals("/api/v1/navigation/menus") && method.equals("GET")) {
                // Este endpoint devuelve un arreglo: se conserva la respuesta original.
                var builder = HttpRequest.newBuilder(URI.create(coreUrl + path)).timeout(Duration.ofSeconds(5))
                    .header("X-App-Id", String.valueOf(((Number) settings.get("id")).intValue())).header("X-App-Key", (String) settings.get("key"));
                if (token(exchange) != null) builder.header("Authorization", "Bearer " + token(exchange));
                var response = HTTP.send(builder.GET().build(), HttpResponse.BodyHandlers.ofByteArray());
                bytes(exchange, response.statusCode(), response.body(), "application/json; charset=utf-8"); return;
            }
            if (path.equals("/api/v1/demo/page") && method.equals("GET")) {
                String query = exchange.getRequestURI().getRawQuery(); String route = "/";
                if (query != null) for (String pair : query.split("&")) if (pair.startsWith("path=")) route = URLDecoder.decode(pair.substring(5), StandardCharsets.UTF_8);
                Reply reply = page(exchange, route);
                if(reply.status!=200) {send(exchange,reply.status,reply.body);return;}
                int userId=((Number)reply.body.get("iam_user_id")).intValue();
                Map<String,Object> result=new LinkedHashMap<>(reply.body);result.putAll(Database.recordAccess(userId,reply.body));
                send(exchange,200,result);return;
            }
            if(path.equals("/api/v1/integration/status") && method.equals("GET")) {
                Reply identity=upstream(exchange,"/auth/introspect","POST",Map.of());
                if(identity.status!=200) {send(exchange,identity.status,identity.body);return;}
                int userId=((Number)((Map<String,Object>)identity.body.get("session")).get("user_id")).intValue();
                send(exchange,200,Database.status(userId));return;
            }
            if (path.startsWith("/api/")) { send(exchange, 404, Map.of("error", "Endpoint no disponible.")); return; }
            if (!method.equals("GET")) { send(exchange, 405, Map.of("error", "Método no permitido.")); return; }
            if (path.startsWith("/assets/") || path.equals("/favicon.svg")) {
                Path target = FRONTEND.resolve(path.substring(1)).normalize();
                if (!target.startsWith(FRONTEND) || !Files.isRegularFile(target)) { send(exchange, 404, Map.of("error", "Archivo no encontrado.")); return; }
                String type = path.endsWith(".js") ? "application/javascript" : path.endsWith(".css") ? "text/css" : "image/svg+xml";
                bytes(exchange, 200, Files.readAllBytes(target), type + "; charset=utf-8"); return;
            }
            int status = path.equals("/") ? 200 : page(exchange, path).status;
            bytes(exchange, status, Files.readAllBytes(FRONTEND.resolve("index.html")), "text/html; charset=utf-8");
        } catch (IllegalArgumentException | IndexOutOfBoundsException error) {
            try { send(exchange, 400, Map.of("error", "Solicitud inválida.")); } catch (Exception ignored) { exchange.close(); }
        } catch (Exception error) {
            try { send(exchange, 503, Map.of("error", "El servicio de seguridad no está disponible. Intenta nuevamente.")); } catch (Exception ignored) { exchange.close(); }
        }
    }
}
