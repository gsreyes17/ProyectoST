import java.util.*;

/** Codec JSON pequeño para el adaptador de demostración, sin dependencias externas. */
public final class Json {
    private final String text;
    private int offset;
    private Json(String text) { this.text = text; }

    public static Object parse(String text) {
        Json parser = new Json(text);
        Object value = parser.value();
        parser.space();
        if (parser.offset != text.length()) throw new IllegalArgumentException("JSON inválido");
        return value;
    }
    @SuppressWarnings("unchecked")
    public static Map<String, Object> object(String text) {
        return (Map<String, Object>) parse(text);
    }
    private void space() { while (offset < text.length() && Character.isWhitespace(text.charAt(offset))) offset++; }
    private char take() { return text.charAt(offset++); }
    private void expect(char expected) { space(); if (take() != expected) throw new IllegalArgumentException("JSON inválido"); }
    private Object value() {
        space(); char c = text.charAt(offset);
        if (c == '{') {
            offset++; Map<String, Object> map = new LinkedHashMap<>(); space();
            if (text.charAt(offset) == '}') { offset++; return map; }
            do {
                space(); String key = string(); expect(':'); map.put(key, value()); space();
                c = take(); if (c == '}') return map;
                if (c != ',') throw new IllegalArgumentException("JSON inválido");
            } while (true);
        }
        if (c == '[') {
            offset++; List<Object> list = new ArrayList<>(); space();
            if (text.charAt(offset) == ']') { offset++; return list; }
            do {
                list.add(value()); space(); c = take(); if (c == ']') return list;
                if (c != ',') throw new IllegalArgumentException("JSON inválido");
            } while (true);
        }
        if (c == '"') return string();
        for (String literal : List.of("true", "false", "null")) {
            if (text.startsWith(literal, offset)) { offset += literal.length(); return literal.equals("null") ? null : literal.equals("true"); }
        }
        int start = offset;
        while (offset < text.length() && "0123456789+-.eE".indexOf(text.charAt(offset)) >= 0) offset++;
        return Double.valueOf(text.substring(start, offset));
    }
    private String string() {
        expect('"'); StringBuilder result = new StringBuilder();
        while (true) {
            char c = take(); if (c == '"') return result.toString();
            if (c == '\\') {
                c = take();
                switch (c) {
                    case 'n' -> result.append('\n'); case 'r' -> result.append('\r'); case 't' -> result.append('\t');
                    case 'b' -> result.append('\b'); case 'f' -> result.append('\f');
                    case 'u' -> { result.append((char) Integer.parseInt(text.substring(offset, offset + 4), 16)); offset += 4; }
                    case '"', '\\', '/' -> result.append(c);
                    default -> throw new IllegalArgumentException("Escape inválido");
                }
            } else { if (c < 32) throw new IllegalArgumentException("JSON inválido"); result.append(c); }
        }
    }
    public static String stringify(Object value) {
        if (value == null) return "null";
        if (value instanceof String text) {
            StringBuilder escaped = new StringBuilder("\"");
            for (char c : text.toCharArray()) {
                switch (c) {
                    case '"' -> escaped.append("\\\""); case '\\' -> escaped.append("\\\\");
                    case '\n' -> escaped.append("\\n"); case '\r' -> escaped.append("\\r"); case '\t' -> escaped.append("\\t");
                    default -> { if (c < 32) escaped.append(String.format("\\u%04x", (int) c)); else escaped.append(c); }
                }
            }
            return escaped.append('"').toString();
        }
        if (value instanceof Map<?, ?> map) {
            return "{" + String.join(",", map.entrySet().stream().map(entry -> stringify(entry.getKey().toString()) + ":" + stringify(entry.getValue())).toList()) + "}";
        }
        if (value instanceof Collection<?> list) return "[" + String.join(",", list.stream().map(Json::stringify).toList()) + "]";
        return value.toString();
    }
}
