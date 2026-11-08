import {
  useEffect,
  useRef,
  useId,
  Children,
  cloneElement,
  isValidElement,
} from "react";
import {
  ShieldCheck,
  LayoutDashboard,
  Users,
  Layers3,
  AppWindow,
  PanelLeft,
  Clock3,
  ScrollText,
  Settings2,
  ArrowUpRight,
  Plus,
  Search,
  X,
  Check,
  LockKeyhole,
  LayoutGrid,
  Package,
  Activity,
  FileText,
  ChartNoAxesCombined,
  ChevronRight,
  Pencil,
  LogOut,
  LoaderCircle,
  AlertCircle,
  KeyRound,
  RefreshCw,
  CircleCheck,
  Copy,
  MoreHorizontal,
  Menu,
  Eye,
  EyeOff,
  ArrowRight,
  Fingerprint,
  ChevronDown,
} from "lucide-react";

export const icons = {
  shield: ShieldCheck,
  overview: LayoutDashboard,
  users: Users,
  roles: Layers3,
  apps: AppWindow,
  menus: PanelLeft,
  sessions: Clock3,
  audit: ScrollText,
  settings: Settings2,
  arrow: ArrowUpRight,
  plus: Plus,
  search: Search,
  close: X,
  check: Check,
  lock: LockKeyhole,
  layout: LayoutGrid,
  package: Package,
  activity: Activity,
  file: FileText,
  chart: ChartNoAxesCombined,
  chevron: ChevronRight,
  edit: Pencil,
  logout: LogOut,
  loading: LoaderCircle,
  alert: AlertCircle,
  key: KeyRound,
  refresh: RefreshCw,
  success: CircleCheck,
  copy: Copy,
  more: MoreHorizontal,
  menu: Menu,
  eye: Eye,
  eyeoff: EyeOff,
  next: ArrowRight,
  fingerprint: Fingerprint,
  down: ChevronDown,
  layers: Layers3,
};
export function Icon({ name, size = 20, ...props }) {
  const Component = icons[name] || LayoutGrid;
  return <Component size={size} strokeWidth={1.8} {...props} />;
}
export function Button({
  children,
  icon,
  variant = "primary",
  className = "",
  busy,
  ...props
}) {
  return (
    <button
      className={`button ${variant} ${className}`}
      disabled={busy || props.disabled}
      {...props}
    >
      {(busy || icon) && (
        <Icon
          name={busy ? "loading" : icon}
          size={17}
          className={busy ? "spin" : ""}
        />
      )}
      {children}
    </button>
  );
}
export function Badge({ children, tone = "green" }) {
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}
export function Avatar({ name = "", small }) {
  return (
    <span className={`avatar ${small ? "small" : ""}`}>
      {name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}
export function Empty({
  title = "Todavía no hay registros",
  description = "Los registros aparecerán aquí cuando empieces a usar el portal.",
  icon = "layout",
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-state">
      <Icon name="loading" className="spin" />
      Cargando información…
    </div>
  );
}
export function ErrorBox({ error }) {
  return error ? (
    <div role="alert" className="error-box">
      <Icon name="alert" size={18} />
      <span>{error}</span>
    </div>
  ) : null;
}
export function Field({ label, hint, children, ...props }) {
  const id = useId();
  function connect(element) {
    if (!isValidElement(element)) return element;
    if (["input", "select", "textarea"].includes(element.type)) {
      return cloneElement(element, {
        id,
        "aria-describedby": hint ? `${id}-hint` : undefined,
      });
    }
    return cloneElement(
      element,
      {},
      Children.map(element.props.children, connect),
    );
  }
  return (
    <div className="field">
      <label htmlFor={id}>
        <span>{label}</span>
      </label>
      {children ? (
        connect(children)
      ) : (
        <input
          id={id}
          aria-describedby={hint ? `${id}-hint` : undefined}
          {...props}
        />
      )}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle" />
    </label>
  );
}
export function Modal({ title, description, children, onClose, wide = false }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const node = ref.current;
    const focusable = () => [
      ...node.querySelectorAll(
        'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
      ),
    ];
    focusable()[0]?.focus();
    const keydown = (event) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const list = focusable();
        const first = list[0];
        const last = list.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function CheckList({ items, selected, onChange, label = "name" }) {
  return (
    <div className="check-list">
      {items.length ? (
        items.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, item.id]
                    : selected.filter((id) => id !== item.id),
                )
              }
            />
            <span>
              <strong>{item[label]}</strong>
              {item.subtitle && <small>{item.subtitle}</small>}
            </span>
          </label>
        ))
      ) : (
        <p className="muted">No hay opciones disponibles.</p>
      )}
    </div>
  );
}
export function Pagination({ total, page, limit = 50, onChange }) {
  return (
    <div className="table-footer">
      <span>
        {total} registro{total !== 1 ? "s" : ""}
      </span>
      <div>
        <button disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Anterior
        </button>
        <span>Página {page}</span>
        <button
          disabled={page * limit >= total}
          onClick={() => onChange(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
export function dateTime(value, zone = "America/Lima") {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: zone,
  }).format(new Date(value));
}
export function duration(minutes) {
  return minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`;
}
