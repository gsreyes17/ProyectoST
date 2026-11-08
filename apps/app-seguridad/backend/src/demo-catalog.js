export const demos = [
  {
    slug: "crm",
    name: "CRM Comercial",
    platform: "Python · FastAPI",
    port: 5001,
    color: "#2563eb",
    description: "Relaciones que impulsan tu negocio.",
    pages: [
      {
        code: "crm.clientes",
        name: "Clientes",
        route: "/clientes",
        icon: "users",
      },
      {
        code: "crm.oportunidades",
        name: "Oportunidades",
        route: "/oportunidades",
        icon: "chart",
      },
      {
        code: "crm.reportes",
        name: "Reportes comerciales",
        route: "/reportes",
        icon: "chart",
      },
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
      {
        code: "almacen.productos",
        name: "Productos",
        route: "/productos",
        icon: "package",
      },
      {
        code: "almacen.movimientos",
        name: "Movimientos",
        route: "/movimientos",
        icon: "activity",
      },
      {
        code: "almacen.reportes",
        name: "Reportes de inventario",
        route: "/reportes",
        icon: "chart",
      },
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
      {
        code: "facturacion.comprobantes",
        name: "Comprobantes",
        route: "/comprobantes",
        icon: "file",
      },
      {
        code: "facturacion.series",
        name: "Series y numeración",
        route: "/series",
        icon: "layers",
      },
      {
        code: "facturacion.reportes",
        name: "Reportes de facturación",
        route: "/reportes",
        icon: "chart",
      },
    ],
  },
];
