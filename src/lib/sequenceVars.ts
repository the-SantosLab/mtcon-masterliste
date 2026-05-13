export function applySequenceVariables(template: string, vars: { vorname?: string; nachname?: string; unternehmen?: string; ansprechpartner?: string; email?: string }) {
  const ansprechpartner = vars.ansprechpartner || (vars.vorname ? `${vars.vorname} ${vars.nachname ?? ''}`.trim() : '');
  const map: Record<string, string> = {
    vorname: vars.vorname || '',
    nachname: vars.nachname || '',
    unternehmen: vars.unternehmen || '',
    ansprechpartner,
    email: vars.email || '',
  };
  return (template || '').replace(/\{\{(vorname|nachname|unternehmen|ansprechpartner|email)\}\}/g, (_, k) => map[k]);
}
