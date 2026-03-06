import { useState, useCallback, useMemo } from "react";
import { DEFAULT_PULL_MODEL, CUSTOM_MODEL_VALUE } from "../components/ollama/OllamaModelSetup";

export interface OllamaModelFormState {
  showOtherModel: boolean;
  otherModelName: string;
  setShowOtherModel: (v: boolean) => void;
  setOtherModelName: (v: string) => void;
  handleOtherSubmit: () => void;
  pullCommand: string;
  isPulling: boolean;
  selectOptions: { value: string; label: string; disabled?: boolean }[];
}

export interface UseOllamaModelFormOptions {
  ollamaModel: string | null;
  ollamaModels: string[];
  pullingModel: string | null;
  onModelChange: (model: string) => void;
}

export function useOllamaModelForm({
  ollamaModel,
  ollamaModels,
  pullingModel,
  onModelChange,
}: UseOllamaModelFormOptions): OllamaModelFormState {
  const [showOtherModel, setShowOtherModel] = useState(false);
  const [otherModelName, setOtherModelName] = useState("");

  const pullCommand = ollamaModel
    ? `ollama pull ${ollamaModel}`
    : `ollama pull ${DEFAULT_PULL_MODEL}`;

  const isPulling = pullingModel !== null && pullingModel === (ollamaModel ?? "");

  const selectOptions = useMemo(() => {
    const opts: { value: string; label: string; disabled?: boolean }[] = [
      { value: "", label: "Select a model", disabled: true },
      { value: DEFAULT_PULL_MODEL, label: `Recommended: ${DEFAULT_PULL_MODEL}` },
    ];
    const seen = new Set<string>([DEFAULT_PULL_MODEL]);
    for (const m of ollamaModels) {
      if (!seen.has(m)) {
        seen.add(m);
        opts.push({ value: m, label: m });
      }
    }
    if (
      ollamaModel &&
      ollamaModel !== "" &&
      !seen.has(ollamaModel) &&
      ollamaModel !== CUSTOM_MODEL_VALUE
    ) {
      opts.push({ value: ollamaModel, label: ollamaModel });
    }
    opts.push({ value: CUSTOM_MODEL_VALUE, label: "✏ Enter custom model name..." });
    return opts;
  }, [ollamaModels, ollamaModel]);

  const handleOtherSubmit = useCallback(() => {
    const name = otherModelName.trim();
    if (name) {
      onModelChange(name);
      setOtherModelName("");
      setShowOtherModel(false);
    }
  }, [otherModelName, onModelChange]);

  return {
    showOtherModel,
    otherModelName,
    setShowOtherModel,
    setOtherModelName,
    handleOtherSubmit,
    pullCommand,
    isPulling,
    selectOptions,
  };
}
