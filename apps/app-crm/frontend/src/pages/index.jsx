import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Button, Empty, ErrorBox, Field, Icon, Loading, Modal } from "../ui";

// Pantallas de esta app. IAM decide por rol qué se muestra:
//   <pantalla>.ver                 → la grilla
//   <pantalla>.crear/editar/...    → cada botón
//   <pantalla>.col.<columna>       → una columna sensible
// Ocultar un elemento solo mejora la experiencia: el backend vuelve a
// comprobar la capacidad en cada operación y responde 403 si fue retirada.
export default function AppPages({ page, path, capabilities, onDenied }) {
  if (!page)
    return (
      <section className="demo-home" data-route={path}>
        <Icon name="layout" size={30} />
        <h2>Selecciona una opción del menú</h2>
        <p>
          Solo aparecen las pantallas, grillas y botones autorizados para tu
          rol.
        </p>
      </section>
    );
  return (
    <ModulePage
      key={page.code}
      page={page}
      capabilities={capabilities}
      onDenied={onDenied}
    />
  );
}

function formatValue(value, type) {
  if (value === null || value === undefined) return "—";
  if (type === "number") return new Intl.NumberFormat("es-PE").format(value);
  if (type === "date") return String(value).split("-").reverse().join("/");
  return String(value);
}

function ModulePage({ page, capabilities, onDenied }) {
  const can = (action) => capabilities.includes(`${page.code}.${action}`);
  const offered = (action) => page.actions.includes(action) && can(action);
  const canView = offered("ver");
  // Campos del formulario: se omiten las columnas sensibles sin permiso.
  const fields = page.columns.filter(
    (column) => !column.protected || can(`col.${column.key}`),
  );
  const query = `path=${encodeURIComponent(page.route)}`;
  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(canView);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  function failed(error) {
    setError(error.message);
    // 403: el permiso fue retirado con la pantalla abierta. Se actualiza la sesión.
    if (error.status === 403) onDenied();
  }
  const load = useCallback(async () => {
    if (!canView) {
      setGrid(null);
      setLoading(false);
      return;
    }
    try {
      setGrid(await api(`/records?${query}`));
      setError("");
    } catch (error) {
      setGrid(null);
      setError(error.message);
      if (error.status === 403) onDenied();
    } finally {
      setLoading(false);
    }
    // Se recarga al cambiar la pantalla o los permisos de grilla y columnas.
  }, [canView, query, fields.length]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    const data = Object.fromEntries(
      fields.map((column) => [
        column.key,
        column.type === "number"
          ? Number(form.values[column.key])
          : form.values[column.key],
      ]),
    );
    try {
      await api(`/records${form.id ? `/${form.id}` : ""}?${query}`, {
        method: form.id ? "PATCH" : "POST",
        body: { data },
      });
      setForm(null);
      setNotice(form.id ? "Registro actualizado." : "Registro creado.");
      await load();
    } catch (error) {
      setForm(null);
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api(`/records/${removing.id}?${query}`, { method: "DELETE" });
      setNotice("Registro eliminado.");
      await load();
    } catch (error) {
      failed(error);
    } finally {
      setRemoving(null);
      setBusy(false);
    }
  }
  async function exportCsv() {
    setBusy(true);
    try {
      // El backend exige la capacidad «exportar» para entregar estos datos.
      const result = await api(`/records?${query}&export=1`);
      const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
      const lines = [
        result.columns.map((column) => cell(column.label)).join(";"),
        ...result.items.map((item) =>
          result.columns.map((column) => cell(item.data[column.key])).join(";"),
        ),
      ];
      const url = URL.createObjectURL(
        new Blob(["﻿" + lines.join("\r\n")], {
          type: "text/csv;charset=utf-8",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${page.code}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice(`Se exportaron ${result.items.length} registros.`);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  function openForm(item) {
    setError("");
    setForm({
      id: item?.id,
      values: Object.fromEntries(
        fields.map((column) => [column.key, item?.data[column.key] ?? ""]),
      ),
    });
  }
  const rowActions = offered("editar") || offered("eliminar");

  return (
    <section className="demo-page" data-page={page.code}>
      <div className="demo-page-toolbar">
        <p>
          {grid
            ? `${grid.items.length} registro${grid.items.length === 1 ? "" : "s"}`
            : " "}
        </p>
        <div className="demo-page-actions">
          {canView && (
            <Button
              variant="secondary"
              icon="refresh"
              onClick={() => void load()}
            >
              Actualizar
            </Button>
          )}
          {offered("exportar") && (
            <Button
              variant="secondary"
              icon="download"
              busy={busy && !form && !removing}
              onClick={exportCsv}
            >
              Exportar
            </Button>
          )}
          {offered("crear") && (
            <Button icon="plus" onClick={() => openForm(null)}>
              Nuevo
            </Button>
          )}
        </div>
      </div>
      <ErrorBox error={error} />
      {notice && (
        <div className="demo-notice" role="status">
          <Icon name="success" size={17} />
          {notice}
        </div>
      )}
      <div className="panel demo-grid">
        {loading ? (
          <Loading />
        ) : !canView ? (
          <Empty
            icon="lock"
            title="Tu rol no incluye esta grilla"
            description="Puedes usar las acciones disponibles en esta pantalla. Solicita el permiso de consulta al administrador de seguridad."
          />
        ) : !grid ? (
          <Empty
            icon="alert"
            title="No se pudo cargar la grilla"
            description="Pulsa Actualizar para volver a intentar."
          />
        ) : !grid.items.length ? (
          <Empty
            title="Todavía no hay registros"
            description="Los registros de esta pantalla aparecerán aquí."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {grid.columns.map((column) => (
                    <th
                      key={column.key}
                      className={column.type === "number" ? "numeric" : ""}
                    >
                      {column.label}
                    </th>
                  ))}
                  {rowActions && <th aria-label="Acciones" />}
                </tr>
              </thead>
              <tbody>
                {grid.items.map((item) => (
                  <tr key={item.id}>
                    {grid.columns.map((column) => (
                      <td
                        key={column.key}
                        className={column.type === "number" ? "numeric" : ""}
                      >
                        {formatValue(item.data[column.key], column.type)}
                      </td>
                    ))}
                    {rowActions && (
                      <td>
                        <div className="row-actions">
                          {offered("editar") && (
                            <button
                              className="icon-button"
                              title="Editar"
                              aria-label={`Editar registro ${item.id}`}
                              onClick={() => openForm(item)}
                            >
                              <Icon name="edit" size={17} />
                            </button>
                          )}
                          {offered("eliminar") && (
                            <button
                              className="icon-button"
                              title="Eliminar"
                              aria-label={`Eliminar registro ${item.id}`}
                              onClick={() => setRemoving(item)}
                            >
                              <Icon name="trash" size={17} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {form && (
        <Modal
          title={form.id ? "Editar registro" : "Nuevo registro"}
          description={page.name}
          onClose={() => setForm(null)}
        >
          <form onSubmit={save} className="editor-form">
            <div className="editor-body">
              {fields.map((column) => (
                <Field
                  key={column.key}
                  label={column.label}
                  required
                  type={
                    column.type === "text"
                      ? "text"
                      : column.type /* number | date */
                  }
                  step={column.type === "number" ? "any" : undefined}
                  maxLength={column.type === "text" ? 120 : undefined}
                  value={form.values[column.key]}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      values: {
                        ...current.values,
                        [column.key]: event.target.value,
                      },
                    }))
                  }
                />
              ))}
            </div>
            <footer className="modal-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setForm(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" busy={busy} icon="check">
                Guardar
              </Button>
            </footer>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal
          title="Eliminar registro"
          description="Esta acción no se puede deshacer."
          onClose={() => setRemoving(null)}
        >
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancelar
            </Button>
            <Button busy={busy} icon="trash" onClick={remove}>
              Eliminar
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
