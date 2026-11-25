-- Se retira el control de grillas, botones y columnas (migración 003).
-- La autorización vuelve a ser solo por menú: el rol decide qué pantallas ve.
DROP TABLE IF EXISTS role_capabilities;
DROP TABLE IF EXISTS capabilities;
