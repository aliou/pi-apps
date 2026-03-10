import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { api } from "../lib/api";

export default function ShareRoute() {
  const { token } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      navigate("/sessions", { replace: true });
      return;
    }

    api
      .get<{ sessionId: string }>(`/sessions/share/${token}`)
      .then((res) => {
        if (!res.data?.sessionId) {
          navigate("/sessions", { replace: true });
          return;
        }
        navigate(`/sessions/${res.data.sessionId}`, { replace: true });
      })
      .catch(() => {
        navigate("/sessions", { replace: true });
      });
  }, [token, navigate]);

  return null;
}
