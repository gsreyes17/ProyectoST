import { useEffect, useState } from "react";
import { Button, Empty, Icon } from "../ui";

// Pantallas de Almacén. El menú lo arma IAM según el rol activo, y el backend
// autoriza la pantalla antes de entregarla junto con sus registros.
// Los botones son de muestra: indican la intención de la función, pero no
// llaman a ningún endpoint ni modifican datos.
export default function AppPages({ page, path }) {
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  const mock = (label) => () =>
    setNotice(`«${label}» es una acción de demostración: no modifica datos.`);

  if (!page)
    return (
      <section className="demo-home" data-route={path}>
        <Icon name="package" size={30} />
        <h2>Selecciona una opción del menú</h2>
        <p>Solo aparecen las pantallas autorizadas para tu rol.</p>
      </section>
    );
  const items = page.items || [];
  const View =
    {
      "almacen.productos": Stock,
      "almacen.movimientos": Movements,
      "almacen.reportes": Board,
    }[page.code] || Table;
  return (
    <section className="demo-page" data-page={page.code}>
      {items.length ? (
        <View page={page} items={items} mock={mock} />
      ) : (
        <div className="panel">
          <Empty
            title="Todavía no hay registros"
            description="Los registros de esta pantalla aparecerán aquí."
          />
        </div>
      )}
      {notice && (
        <div className="mock-notice" role="status">
          <Icon name="alert" size={17} />
          {notice}
        </div>
      )}
    </section>
  );
}

const number = (value) => new Intl.NumberFormat("es-PE").format(value);
const LOW_STOCK = 100;

function Stock({ items, mock }) {
  const highest = Math.max(...items.map(({ data }) => data.stock));
  const low = items.filter(({ data }) => data.stock < LOW_STOCK).length;
  return (
    <>
      <div className="wh-toolbar">
        <p>
          {items.length} productos ·{" "}
          <span className="wh-alert">{low} con stock bajo</span>
        </p>
        <div className="wh-actions">
          <Button
            variant="secondary"
            icon="download"
            onClick={mock("Exportar inventario")}
          >
            Exportar
          </Button>
          <Button
            variant="secondary"
            icon="upload"
            onClick={mock("Registrar salida")}
          >
            Salida
          </Button>
          <Button icon="inbound" onClick={mock("Registrar ingreso")}>
            Ingreso
          </Button>
        </div>
      </div>
      <div className="panel demo-grid">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Nivel</th>
                <th className="numeric">Stock</th>
                <th className="numeric">Costo unitario</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ id, data }) => {
                const isLow = data.stock < LOW_STOCK;
                return (
                  <tr key={id} data-record>
                    <td>{data.codigo}</td>
                    <td>{data.nombre}</td>
                    <td>
                      <span className="wh-level">
                        <span
                          className={isLow ? "low" : ""}
                          style={{
                            width: `${Math.max(4, (data.stock / highest) * 100)}%`,
                          }}
                        />
                      </span>
                    </td>
                    <td className="numeric">{number(data.stock)}</td>
                    <td className="numeric">
                      {data.costo === undefined
                        ? "—"
                        : `S/ ${data.costo.toFixed(2)}`}
                    </td>
                    <td>
                      <span className={`wh-status ${isLow ? "low" : ""}`}>
                        {isLow ? "Reponer" : "OK"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const movementTypes = {
  Ingreso: { icon: "inbound", sign: "+", tone: "in" },
  Salida: { icon: "arrow", sign: "−", tone: "out" },
  Ajuste: { icon: "refresh", sign: "±", tone: "adjust" },
};
function Movements({ items, mock }) {
  const days = [...new Set(items.map(({ data }) => data.fecha))]
    .sort()
    .reverse();
  return (
    <>
      <div className="wh-toolbar">
        <p>{items.length} movimientos registrados</p>
        <div className="wh-actions">
          <Button
            variant="secondary"
            icon="printer"
            onClick={mock("Imprimir guía")}
          >
            Imprimir guía
          </Button>
          <Button icon="plus" onClick={mock("Nuevo movimiento")}>
            Nuevo movimiento
          </Button>
        </div>
      </div>
      <div className="wh-timeline">
        {days.map((day) => (
          <section key={day}>
            <h3>{day.split("-").reverse().join("/")}</h3>
            {items
              .filter(({ data }) => data.fecha === day)
              .map(({ id, data }) => {
                const type = movementTypes[data.tipo] || movementTypes.Ajuste;
                return (
                  <article
                    key={id}
                    className={`wh-move ${type.tone}`}
                    data-record
                  >
                    <span className="wh-move-icon">
                      <Icon name={type.icon} size={16} />
                    </span>
                    <div>
                      <strong>{data.producto}</strong>
                      <small>{data.tipo}</small>
                    </div>
                    <span className="wh-move-qty">
                      {type.sign}
                      {number(data.cantidad)}
                    </span>
                  </article>
                );
              })}
          </section>
        ))}
      </div>
    </>
  );
}

function Board({ items, mock }) {
  const periods = [...new Set(items.map(({ data }) => data.periodo))]
    .sort()
    .reverse();
  return (
    <>
      <div className="wh-toolbar">
        <p>Indicadores de inventario</p>
        <div className="wh-actions">
          <Button icon="download" onClick={mock("Exportar indicadores")}>
            Exportar
          </Button>
        </div>
      </div>
      {periods.map((period) => (
        <section className="wh-board" key={period}>
          <h3>Periodo {period}</h3>
          <div>
            {items
              .filter(({ data }) => data.periodo === period)
              .map(({ id, data }) => (
                <article key={id} data-record>
                  <small>{data.indicador}</small>
                  <strong>{number(data.valor)}</strong>
                </article>
              ))}
          </div>
        </section>
      ))}
    </>
  );
}

// Respaldo para pantallas nuevas sin diseño propio.
function Table({ page, items }) {
  return (
    <div className="panel demo-grid">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {page.columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(({ id, data }) => (
              <tr key={id} data-record>
                {page.columns.map((column) => (
                  <td key={column.key}>{String(data[column.key] ?? "—")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
