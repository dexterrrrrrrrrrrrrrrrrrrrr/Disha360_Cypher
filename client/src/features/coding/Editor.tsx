import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import "monaco-editor/esm/vs/basic-languages/java/java.contribution";
import "monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution";
import "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution";
import type { Language } from "./templates";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
self.MonacoEnvironment = {
  getWorker: (_id: string, label: string) => new EditorWorker(),
};
loader.config({ monaco });
export default function CodeEditor({
  language,
  source,
  onChange,
  disabled,
}: {
  language: Language;
  source: string;
  onChange: (s: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <Editor
        height="420px"
        language={language}
        value={source}
        onChange={(s) => onChange(s || "")}
        loading={
          <p role="status" className="p-5">
            Loading editor…
          </p>
        }
        options={{
          readOnly: disabled,
          minimap: { enabled: false },
          fontSize: 14,
          tabSize: 4,
          wordWrap: "on",
          automaticLayout: true,
          scrollBeyondLastLine: false,
          ariaLabel: "Solution code",
          padding: { top: 16 },
        }}
      />
    </div>
  );
}
