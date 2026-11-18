// Catálogo inicial de las demos. Cada pantalla declara sus capacidades:
// la grilla (ver), los botones (crear, editar, eliminar, exportar) y sus
// columnas sensibles. Los códigos coinciden con `backend/app.json` de cada app.
const actions = {
  ver: ["grid", "Ver grilla"],
  crear: ["button", "Botón Nuevo"],
  editar: ["button", "Botón Editar"],
  eliminar: ["button", "Botón Eliminar"],
  exportar: ["button", "Botón Exportar"],
};
function page(code, name, route, icon, allowed, protectedColumns = {}) {
  return {
    code,
    name,
    route,
    icon,
    capabilities: [
      ...allowed.map((action) => ({
        code: `${code}.${action}`,
        action,
        kind: actions[action][0],
        name: actions[action][1],
      })),
      ...Object.entries(protectedColumns).map(([key, label]) => ({
        code: `${code}.col.${key}`,
        kind: "column",
        name: `Columna ${label}`,
      })),
    ],
  };
}
const all = ["ver", "crear", "editar", "eliminar", "exportar"];

// Asignación inicial por nombre de rol. Solo se aplica a capacidades que la
// carga inicial acaba de crear; nunca reemplaza permisos editados en el panel.
export const initialGrants = {
  Administrador: "*",
  "Usuario normal": ["ver", "crear"],
};

export const demos = [
  {
    slug: "crm",
    name: "CRM Comercial",
    platform: "Python · FastAPI",
    port: 5001,
    color: "#2563eb",
    description: "Relaciones que impulsan tu negocio.",
    pages: [
      page("crm.clientes", "Clientes", "/clientes", "users", all, {
        limite_credito: "Límite de crédito",
      }),
      page(
        "crm.oportunidades",
        "Oportunidades",
        "/oportunidades",
        "chart",
        all,
        {
          margen: "Margen %",
        },
      ),
      page("crm.reportes", "Reportes comerciales", "/reportes", "chart", [
        "ver",
        "exportar",
      ]),
    ],
  },
  {
    slug: "almacen",
    name: "Almacén",
    platform: "Java · HTTP Server",
    port: 5002,
    color: "#059669",
    description: "Cada producto, en su lugar.",
    pages: [
      page("almacen.productos", "Productos", "/productos", "package", all, {
        costo: "Costo unitario",
      }),
      page("almacen.movimientos", "Movimientos", "/movimientos", "activity", [
        "ver",
        "crear",
        "exportar",
      ]),
      page("almacen.reportes", "Reportes de inventario", "/reportes", "chart", [
        "ver",
        "exportar",
      ]),
    ],
  },
  {
    slug: "facturacion",
    name: "Facturación",
    platform: "Node.js · Express",
    port: 5003,
    color: "#7c3aed",
    description: "Tu operación, en orden.",
    pages: [
      page(
        "facturacion.comprobantes",
        "Comprobantes",
        "/comprobantes",
        "file",
        all,
        {
          descuento: "Descuento",
        },
      ),
      page("facturacion.series", "Series y numeración", "/series", "layers", [
        "ver",
        "crear",
        "editar",
      ]),
      page(
        "facturacion.reportes",
        "Reportes de facturación",
        "/reportes",
        "chart",
        ["ver", "exportar"],
      ),
    ],
  },
];
