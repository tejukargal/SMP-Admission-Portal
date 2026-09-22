import { useEffect, useState } from 'react';
import {
  getAiSettingsConfig, saveAiTextChoice,
  type TextFeature, type TextProvider,
} from '../services/adminConfigService';

/** Loads one feature's saved text provider/model and persists any change
 *  straight away — these read as settings rather than form fields, so there is
 *  no Save button to press.
 *
 *  A failed write is swallowed deliberately: the picker sits inside cards that
 *  surface their own generation errors, and a lost preference is not worth
 *  hijacking that space for. */
export function useTextModelChoice(feature: TextFeature) {
  const [provider, setProvider] = useState<TextProvider>('gemini');
  const [model, setModel] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAiSettingsConfig()
      .then((cfg) => {
        if (cancelled || !cfg) return;
        setProvider(cfg[`${feature}Provider`] as TextProvider);
        setModel(cfg[`${feature}Model`]);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [feature]);

  function setChoice(nextProvider: TextProvider, nextModel: string) {
    setProvider(nextProvider);
    setModel(nextModel);
    void saveAiTextChoice(feature, nextProvider, nextModel).catch(() => {});
  }

  return { provider, model, setChoice, loading };
}
