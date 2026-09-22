import { Select } from './Select';
import { textModelsFor, type TextProvider } from '../../services/adminConfigService';

const PROVIDER_OPTIONS: { value: TextProvider; label: string }[] = [
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'claude', label: 'Claude (Anthropic)' },
  { value: 'openai', label: 'OpenAI' },
];

// Which web-reading tool each provider uses when a feature needs live pages.
const GROUNDING_NOTE: Record<TextProvider, string> = {
  gemini: 'Google Search + URL context',
  claude: 'web search + web fetch',
  openai: 'web search',
};

interface TextModelPickerProps {
  provider: TextProvider;
  model: string;
  onChange: (provider: TextProvider, model: string) => void;
  /** Features that must read live web pages. Adds a note naming the tool each
   *  provider uses, so the admin knows grounding is in play (and that these
   *  calls cost considerably more than a plain one). */
  grounded?: boolean;
  disabled?: boolean;
}

/** Provider + model pair for a text feature, mirroring the Image Provider /
 *  Image Model pattern in AI Settings. An empty saved model shows the first
 *  option, which is exactly the Cloud Function's fallback. */
export function TextModelPicker({ provider, model, onChange, grounded, disabled }: TextModelPickerProps) {
  const options = textModelsFor(provider);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="AI Provider"
          value={provider}
          disabled={disabled}
          // Switching provider must also move the model onto that provider's
          // list, or the saved pair would be a model the provider cannot serve.
          onChange={(e) => {
            const next = e.target.value as TextProvider;
            onChange(next, textModelsFor(next)[0].value);
          }}
          options={PROVIDER_OPTIONS}
        />
        <Select
          label="Model"
          value={model || options[0].value}
          disabled={disabled}
          onChange={(e) => onChange(provider, e.target.value)}
          options={options}
        />
      </div>
      {grounded && (
        <p className="text-xs text-gray-400">
          Reads live web pages using {GROUNDING_NOTE[provider]}. Grounded calls open many pages and cost
          noticeably more than a plain one — a stronger model is usually worth it here.
        </p>
      )}
    </div>
  );
}
