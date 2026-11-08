import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Auth from "./Auth";
import Admin from "./Admin";
import { api, setCsrf } from "./api";
import { Loading, ErrorBox, Button, Icon } from "./ui";
import "./styles.css";

function App() {
  const [config, setConfig] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function loadIdentity() {
    const next = await api("/me");
    setIdentity(next);
    setNotice("");
  }
  useEffect(() => {
    async function initialize() {
      try {
        const next = await api("/public/config");
        setConfig(next);
        document.title = `${next.appName} · ${next.companyName}`;
        try {
          await loadIdentity();
        } catch (error) {
          if (error.status !== 401) setError(error.message);
        }
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    }
    initialize();
    const expired = () => {
      setIdentity(null);
      setCsrf("");
      setNotice(
        "La sesión venció o fue revocada. Ingresa de nuevo para continuar.",
      );
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST", body: {} });
      setIdentity(null);
      setCsrf("");
      setNotice("Cerraste tu sesión correctamente.");
    } catch (error) {
      if (error.status === 401) {
        setIdentity(null);
        setCsrf("");
      } else setError(error.message);
    }
  }
  if (loading)
    return (
      <div className="boot-screen">
        <span className="brand-symbol">
          <Icon name="shield" size={30} />
        </span>
        <Loading />
      </div>
    );
  if (!config || error)
    return (
      <div className="boot-screen">
        <h1>Portal de Seguridad</h1>
        <ErrorBox error={error || "No se pudo cargar la configuración."} />
        <Button onClick={() => location.reload()}>Volver a intentar</Button>
      </div>
    );
  if (!identity)
    return (
      <Auth config={config} onAuthenticated={loadIdentity} notice={notice} />
    );
  return <Admin config={config} session={identity.session} onLogout={logout} />;
}
createRoot(document.getElementById("root")).render(<App />);
