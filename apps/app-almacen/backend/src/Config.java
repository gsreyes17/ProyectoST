import java.nio.file.*;
import java.util.*;

/** Configuracion privada de Almacen. No lee archivos de otras aplicaciones. */
public final class Config {
    private static final Map<String,String> VALUES = new HashMap<>();
    public static void load(Path backend) throws Exception {
        for (String line : Files.readAllLines(backend.resolve(".env"))) {
            line=line.trim();
            if(line.isBlank() || line.startsWith("#") || !line.contains("=")) continue;
            String[] pair=line.split("=",2);String value=pair[1].trim();
            if(value.startsWith("\"")) value=(String)Json.parse(value);
            else if(value.startsWith("'") && value.endsWith("'")) value=value.substring(1,value.length()-1);
            VALUES.put(pair[0].trim(),value);
        }
    }
    public static String get(String key) {
        String value=System.getenv(key);
        return value!=null ? value : VALUES.get(key);
    }
}
