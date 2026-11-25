import { useEffect, useState } from "react";
import { Avatar, Button, Empty, Icon } from "../ui";

// Pantallas del CRM. El menú lo arma IAM según el rol activo, y el backend
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
        <Icon name="layout" size={30} />
        <h2>Selecciona una opción del menú</h2>
        <p>Solo aparecen las pantallas autorizadas para tu rol.</p>
      </section>
    );
  const items = page.items || [];
  const View =
    {
      "crm.clientes": Clients,
      "crm.oportunidades": Pipeline,
      "crm.reportes": Reports,
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

const money = (value) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 0,
  }).format(value);

function Clients({ items, mock }) {
  const [query, setQuery] = useState("");
  const visible = items.filter(({ data }) =>
    `${data.nombre} ${data.ruc} ${data.ciudad}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const credit = items.reduce(
    (sum, { data }) => sum + (data.limite_credito || 0),
    0,
  );
  const highest = Math.max(
    ...items.map(({ data }) => data.limite_credito || 0),
  );
  return (
    <>
      <div className="crm-toolbar">
        <label className="crm-search">
          <Icon name="search" size={17} />
          <input
            aria-label="Buscar clientes"
            placeholder="Buscar por nombre, RUC o ciudad…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="crm-actions">
          <Button
            variant="secondary"
            icon="upload"
            onClick={mock("Importar clientes")}
          >
            Importar
          </Button>
          <Button icon="plus" onClick={mock("Nuevo cliente")}>
            Nuevo cliente
          </Button>
        </div>
      </div>
      <div className="crm-stats">
        <span>
          <strong>{items.length}</strong> clientes
        </span>
        <span>
          <strong>{money(credit)}</strong> de crédito aprobado
        </span>
        <span>
          <strong>{new Set(items.map(({ data }) => data.ciudad)).size}</strong>{" "}
          ciudades
        </span>
      </div>
      <div className="crm-cards">
        {visible.map(({ id, data }) => (
          <article className="crm-client" key={id} data-record>
            <header>
              <Avatar name={data.nombre} />
              <div>
                <h3>{data.nombre}</h3>
                <small>RUC {data.ruc}</small>
              </div>
            </header>
            <p className="crm-city">
              <Icon name="pin" size={15} />
              {data.ciudad}
            </p>
            <div className="crm-credit">
              <span>
                Límite de crédito
                <strong>{money(data.limite_credito)}</strong>
              </span>
              <div className="crm-meter">
                <span
                  style={{
                    width: `${((data.limite_credito || 0) / highest) * 100}%`,
                  }}
                />
              </div>
            </div>
            <footer>
              <button type="button" onClick={mock("Ver ficha del cliente")}>
                Ver ficha
              </button>
              <button type="button" onClick={mock("Registrar contacto")}>
                Contactar
              </button>
            </footer>
          </article>
        ))}
      </div>
      {!visible.length && (
        <p className="crm-empty-search">
          Ningún cliente coincide con «{query}».
        </p>
      )}
    </>
  );
}

const stages = [
  "Contacto inicial",
  "Propuesta",
  "Negociación",
  "Ganada",
  "Perdida",
];
function Pipeline({ items, mock }) {
  const total = items
    .filter(({ data }) => !["Ganada", "Perdida"].includes(data.etapa))
    .reduce((sum, { data }) => sum + data.monto, 0);
  return (
    <>
      <div className="crm-toolbar">
        <p className="crm-lead">
          <strong>{money(total)}</strong> en oportunidades abiertas
        </p>
        <div className="crm-actions">
          <Button variant="secondary" icon="filter" onClick={mock("Filtrar")}>
            Filtrar
          </Button>
          <Button icon="plus" onClick={mock("Nueva oportunidad")}>
            Nueva oportunidad
          </Button>
        </div>
      </div>
      <div className="crm-board">
        {stages.map((stage) => {
          const cards = items.filter(({ data }) => data.etapa === stage);
          return (
            <section
              key={stage}
              className={`crm-column stage-${stages.indexOf(stage)}`}
            >
              <header>
                <h3>{stage}</h3>
                <span>{cards.length}</span>
              </header>
              <p className="crm-column-total">
                {money(cards.reduce((sum, { data }) => sum + data.monto, 0))}
              </p>
              {cards.map(({ id, data }) => (
                <button
                  type="button"
                  className="crm-deal"
                  key={id}
                  data-record
                  onClick={mock("Abrir oportunidad")}
                >
                  <strong>{data.cliente}</strong>
                  <span className="crm-deal-amount">{money(data.monto)}</span>
                  {data.margen !== undefined && (
                    <small>Margen {data.margen}%</small>
                  )}
                </button>
              ))}
              {!cards.length && (
                <p className="crm-column-empty">Sin oportunidades</p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function Reports({ items, mock }) {
  const periods = [...new Set(items.map(({ data }) => data.periodo))].sort();
  return (
    <>
      <div className="crm-toolbar">
        <p className="crm-lead">Indicadores comerciales por periodo</p>
        <div className="crm-actions">
          <Button
            variant="secondary"
            icon="download"
            onClick={mock("Descargar PDF")}
          >
            Descargar PDF
          </Button>
          <Button icon="send" onClick={mock("Enviar por correo")}>
            Enviar por correo
          </Button>
        </div>
      </div>
      {periods.reverse().map((period) => (
        <section className="crm-period" key={period}>
          <h3>
            <Icon name="calendar" size={16} />
            {period}
          </h3>
          <div className="crm-kpis">
            {items
              .filter(({ data }) => data.periodo === period)
              .map(({ id, data }) => (
                <article className="crm-kpi" key={id} data-record>
                  <span>{data.indicador}</span>
                  <strong>
                    {data.valor >= 1000
                      ? money(data.valor)
                      : new Intl.NumberFormat("es-PE").format(data.valor)}
                  </strong>
                  <small>
                    <Icon name="trend" size={14} />
                    Periodo {period}
                  </small>
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
