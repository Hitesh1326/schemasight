import { useState, useEffect, useCallback } from "react";
import { postMessage, onMessage } from "../vscodeApi";

/** Ollama status: availability, selected model state, list of installed models, and actions. */
export interface OllamaStatus {
  available: boolean | null;
  model: string | null;
  modelPulled: boolean | null;
  models: string[];
  setModel: (model: string) => void;
  check: () => void;
  pullModel: (model: string) => void;
  pullingModel: string | null;
}

/**
 * Ollama status driven by extension. On mount calls check() which posts GET_OLLAMA_STATUS and
 * GET_OLLAMA_MODELS; OLLAMA_STATUS and OLLAMA_MODELS update state. setModel(model) persists the
 * selection and refreshes status.
 */
export function useOllamaStatus(): OllamaStatus {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [model, setModelState] = useState<string | null>(null);
  const [modelPulled, setModelPulled] = useState<boolean | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [pullingModel, setPullingModel] = useState<string | null>(null);

  const check = useCallback(() => {
    setAvailable(null);
    setModelState(null);
    setModelPulled(null);
    setModels([]);
    postMessage({ type: "GET_OLLAMA_STATUS" });
    postMessage({ type: "GET_OLLAMA_MODELS" });
  }, []);

  useEffect(() => {
    check();
    const unsubscribe = onMessage((message) => {
      if (message.type === "OLLAMA_STATUS") {
        setAvailable(message.payload.available);
        setModelState(message.payload.model ?? null);
        setModelPulled(message.payload.modelPulled ?? null);
        setPullingModel(null);
      }
      if (message.type === "PULL_STARTED") {
        setPullingModel(message.payload.model);
      }
      if (message.type === "OLLAMA_MODELS") {
        setModels(message.payload.models ?? []);
      }
    });
    return unsubscribe;
  }, [check]);

  const setModel = useCallback((newModel: string) => {
    postMessage({ type: "SET_OLLAMA_MODEL", payload: { model: newModel } });
  }, []);

  const pullModel = useCallback((modelName: string) => {
    postMessage({ type: "PULL_MODEL", payload: { model: modelName } });
  }, []);

  return {
    available,
    model,
    modelPulled,
    models,
    setModel,
    check,
    pullModel,
    pullingModel,
  };
}
