import { useEffect, useState } from "react";
import { Button, Empty, Icon } from "../ui";

// Pantallas de Facturación. El menú lo arma IAM según el rol activo, y el
// backend autoriza la pantalla antes de entregarla junto con sus registros.
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
        <Icon name="file" size={30} />
        <h2>Selecciona una opción del menú</h2>
        <p>Solo aparecen las pantallas autorizadas para tu rol.</p>
      </section>
    );
  const items = page.items || [];
  const View =
    {
      "facturacion.comprobantes": Vouchers,
      "facturacion.series": Series,
      "facturacion.reportes": Statement,
    }[page.code] || Table;
  return (
    <section className="demo-page" data-page={page.code}>
      {items.length ? (
        <View page={page} items={items} mock={mock} />
      ) : (
        <Empty
          title="Todavía no hay registros"
          description="Los registros de esta pantalla aparecerán aquí."
        />
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

const amount = (value) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(value);
const date = (value) => String(value).split("-").reverse().join("/");
const kinds = [
  { key: "F", label: "Factura", match: (n) => /^F\d/.test(n) },
  { key: "B", label: "Boleta", match: (n) => /^B\d/.test(n) },
  { key: "FC", label: "Nota de crédito", match: (n) => /^FC/.test(n) },
];
const kindOf = (number) =>
  kinds.find((kind) => kind.match(number)) || {
    key: "?",
    label: "Comprobante",
  };

function Vouchers({ items, mock }) {
  const [filter, setFilter] = useState("");
  const visible = items.filter(
    ({ data }) => !filter || kindOf(data.numero).key === filter,
  );
  const billed = items.reduce((sum, { data }) => sum + data.total, 0);
  const discounts = items.reduce(
    (sum, { data }) => sum + (data.descuento || 0),
    0,
  );
  return (
    <>
      <div className="fx-summary">
        <div>
          <span>Total facturado</span>
          <strong>{amount(billed)}</strong>
        </div>
        <div>
          <span>Descuentos otorgados</span>
          <strong>{amount(discounts)}</strong>
        </div>
        <div>
          <span>Comprobantes</span>
          <strong>{items.length}</strong>
        </div>
      </div>
      <div className="fx-toolbar">
        <div className="fx-tabs" role="group" aria-label="Tipo de comprobante">
          {[{ key: "", label: "Todos" }, ...kinds].map((kind) => (
            <button
              type="button"
              key={kind.key}
              className={filter === kind.key ? "selected" : ""}
              aria-pressed={filter === kind.key}
              onClick={() => setFilter(kind.key)}
            >
              {kind.label}
            </button>
          ))}
        </div>
        <div className="fx-actions">
          <Button
            variant="secondary"
            icon="download"
            onClick={mock("Exportar registro de ventas")}
          >
            Exportar registro
          </Button>
          <Button icon="plus" onClick={mock("Emitir comprobante")}>
            Emitir comprobante
          </Button>
        </div>
      </div>
      <ol className="fx-register">
        {visible.map(({ id, data }) => {
          const kind = kindOf(data.numero);
          return (
            <li key={id} data-record>
              <span className={`fx-kind kind-${kind.key}`}>{kind.label}</span>
              <div className="fx-number">
                <strong>{data.numero}</strong>
                <small>{data.cliente}</small>
              </div>
              <span className="fx-date">{date(data.fecha)}</span>
              <div className="fx-total">
                <strong>{amount(data.total)}</strong>
                {data.descuento ? (
                  <small>Descuento {amount(data.descuento)}</small>
                ) : null}
              </div>
              <div className="fx-row-actions">
                <button
                  type="button"
                  title="Ver PDF"
                  aria-label={`Ver PDF de ${data.numero}`}
                  onClick={mock("Ver PDF")}
                >
                  <Icon name="printer" size={17} />
                </button>
                <button
                  type="button"
                  title="Enviar al cliente"
                  aria-label={`Enviar ${data.numero} al cliente`}
                  onClick={mock("Enviar al cliente")}
                >
                  <Icon name="send" size={17} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Series({ items, mock }) {
  return (
    <>
      <div className="fx-toolbar">
        <p className="fx-intro">
          Numeración vigente por tipo de comprobante y sucursal.
        </p>
        <div className="fx-actions">
          <Button icon="plus" onClick={mock("Nueva serie")}>
            Nueva serie
          </Button>
        </div>
      </div>
      <div className="fx-series">
        {items.map(({ id, data }) => (
          <article key={id} data-record>
            <span className="fx-series-code">{data.serie}</span>
            <h3>{data.tipo}</h3>
            <dl>
              <div>
                <dt>Último emitido</dt>
                <dd>
                  {data.serie}-{String(data.correlativo).padStart(8, "0")}
                </dd>
              </div>
              <div>
                <dt>Próximo número</dt>
                <dd>
                  {data.serie}-{String(data.correlativo + 1).padStart(8, "0")}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              className="fx-link"
              onClick={mock("Ajustar correlativo")}
            >
              Ajustar correlativo
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

function Statement({ items, mock }) {
  const periods = [...new Set(items.map(({ data }) => data.periodo))]
    .sort()
    .reverse();
  return (
    <>
      <div className="fx-toolbar">
        <p className="fx-intro">Resumen de facturación por periodo.</p>
        <div className="fx-actions">
          <Button variant="secondary" icon="printer" onClick={mock("Imprimir")}>
            Imprimir
          </Button>
          <Button icon="download" onClick={mock("Descargar PDF")}>
            Descargar PDF
          </Button>
        </div>
      </div>
      {periods.map((period) => (
        <section className="fx-statement" key={period}>
          <h3>Periodo {period}</h3>
          <dl>
            {items
              .filter(({ data }) => data.periodo === period)
              .map(({ id, data }) => (
                <div key={id} data-record>
                  <dt>{data.indicador}</dt>
                  <dd>
                    {data.valor >= 1000
                      ? amount(data.valor)
                      : new Intl.NumberFormat("es-PE").format(data.valor)}
                  </dd>
                </div>
              ))}
          </dl>
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
