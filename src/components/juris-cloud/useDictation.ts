import { useEffect, useRef, useState } from "react";

/**
 * Ditado por voz (fala → texto no input, para o usuário revisar e enviar).
 * Modo contínuo + interimResults para transcrição fluida; reinicia sozinho no
 * onend enquanto o usuário mantém o mic ligado, de modo que falas LONGAS não
 * sejam cortadas quando o navegador encerra a sessão após silêncio/tempo.
 *
 * Interface enxuta: depende apenas do par input/setInput do chat — sem
 * acoplamento ao resto do orquestrador. Extraído do JurisCloudOS (comportamento
 * idêntico).
 */
export function useDictation(inputVal: string, setInputVal: (v: string) => void) {
  const [isRecording, setIsRecording] = useState(false);
  // Ditado por voz suportado? (webkitSpeechRecognition/SpeechRecognition).
  // Detectado no mount; controla o estado desabilitado do botão de microfone.
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Ditado longo: o usuário ainda quer o mic ligado? (usado pelo onend p/ reiniciar).
  const keepListeningRef = useRef(false);
  // Texto já no input quando o ditado começou + finais acumulados entre reinícios.
  const dictationBaseRef = useRef("");
  const dictationFinalRef = useRef("");

  // Ditado por voz — detecta suporte no mount (fallback gracioso se ausente).
  const getSpeechRecognitionCtor = () => {
    if (typeof window === "undefined") return undefined;
    const w = window as Window & {
      SpeechRecognition?: new () => SpeechRecognition;
      webkitSpeechRecognition?: new () => SpeechRecognition;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition;
  };

  useEffect(() => {
    setSpeechSupported(!!getSpeechRecognitionCtor());
  }, []);

  // Encerra o reconhecimento sem deixar o mic preso ligado.
  useEffect(() => {
    return () => {
      keepListeningRef.current = false;
      recognitionRef.current?.abort();
    };
  }, []);

  // Compõe o input: texto pré-existente + falas finalizadas + trecho provisório.
  const composeDictation = (interim: string) =>
    [dictationBaseRef.current, dictationFinalRef.current, interim]
      .map(s => s.trim())
      .filter(Boolean)
      .join(" ");

  // Ditado por voz (fala → texto no input, para o usuário revisar e enviar).
  // Modo contínuo + interimResults para transcrição fluida; reinicia sozinho no
  // onend enquanto o usuário mantém o mic ligado, de modo que falas LONGAS não
  // sejam cortadas quando o navegador encerra a sessão após silêncio/tempo.
  const toggleRecording = () => {
    if (isRecording) {
      // Desligar: para de ouvir e não reinicia (mic nunca fica preso ligado).
      keepListeningRef.current = false;
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SR = getSpeechRecognitionCtor();
    if (!SR) {
      setSpeechSupported(false);
      return;
    }
    // Guarda o texto atual do input e zera o acumulador de falas finalizadas.
    dictationBaseRef.current = inputVal;
    dictationFinalRef.current = "";
    keepListeningRef.current = true;

    const recognition = new SR();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      let final = dictationFinalRef.current;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const txt = res[0].transcript;
        if (res.isFinal) final = (final + " " + txt).trim();
        else interim += txt;
      }
      dictationFinalRef.current = final;
      setInputVal(composeDictation(interim));
    };
    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      // Erros fatais (permissão negada) encerram o ditado; transitórios
      // (no-speech, aborted) deixam o onend reiniciar enquanto o mic estiver ligado.
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        keepListeningRef.current = false;
        setIsRecording(false);
      }
    };
    recognition.onend = () => {
      // Se o usuário ainda está ditando, reinicia sem perder o texto já transcrito.
      if (keepListeningRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          // Reinício falhou (estado inesperado) — encerra graciosamente.
          keepListeningRef.current = false;
        }
      }
      setIsRecording(false);
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsRecording(true);
    } catch {
      keepListeningRef.current = false;
      setIsRecording(false);
    }
  };

  return { isRecording, speechSupported, toggleRecording };
}
