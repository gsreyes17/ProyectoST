import java.net.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.*;

/** Todas las consultas se ejecutan exclusivamente en la base propia de Almacen. */
public final class Database {
    private static Connection connect() throws Exception {
        URI uri=URI.create(Config.get("DATABASE_URL"));
        String[] credentials=uri.getRawUserInfo().split(":",2);
        Properties properties=new Properties();
        properties.setProperty("user",URLDecoder.decode(credentials[0],StandardCharsets.UTF_8));
        properties.setProperty("password",URLDecoder.decode(credentials[1],StandardCharsets.UTF_8));
        properties.setProperty("connectTimeout","3");properties.setProperty("socketTimeout","5");
        return DriverManager.getConnection("jdbc:postgresql://"+uri.getHost()+":"+(uri.getPort()==-1?5432:uri.getPort())+uri.getPath(),properties);
    }
    public static Map<String,Object> status(int userId) throws Exception {
        try(Connection connection=connect();PreparedStatement query=connection.prepareStatement("SELECT current_database(),current_user,(SELECT count(*) FROM integration_access WHERE iam_user_id=?)")) {
            query.setInt(1,userId);
            try(ResultSet result=query.executeQuery()) {result.next();return Map.of("application","almacen","database",result.getString(1),"database_user",result.getString(2),"own_accesses",result.getLong(3));}
        }
    }
    public static Map<String,Object> recordAccess(int userId,Map<String,Object> page) throws Exception {
        try(Connection connection=connect();PreparedStatement query=connection.prepareStatement("INSERT INTO integration_access(iam_user_id,permission_code,route) VALUES(?,?,?) RETURNING id,current_database()")) {
            query.setInt(1,userId);query.setString(2,(String)page.get("code"));query.setString(3,(String)page.get("route"));
            try(ResultSet result=query.executeQuery()) {result.next();return Map.of("access_id",result.getLong(1),"database",result.getString(2));}
        }
    }
}
