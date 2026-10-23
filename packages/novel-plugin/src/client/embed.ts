import { useEffect, useState } from "react";

export function isKaituEmbedded(hash: string): boolean {
  return /(?:^|[?&#])kaitu-embed=1(?:[&#]|$)/.test(hash);
}

export function useKaituEmbedded(): boolean {
  const [embedded, setEmbedded] = useState(() => isKaituEmbedded(window.location.hash));
  useEffect(() => {
    const update = () => setEmbedded(isKaituEmbedded(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return embedded;
}
