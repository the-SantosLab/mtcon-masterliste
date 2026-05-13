export function applySequenceVariables(template: string, vars: { vorname?: string; nachname?: string; unternehmen?: string; ansprechpartner?: string; email?: string }) {
  return (template || '')
    .replaceAll('{{vorname}}', vars.vorname || '')
    .replaceAll('{{nachname}}', vars.nachname || '')
    .replaceAll('{{unternehmen}}', vars.unternehmen || '')
    .replaceAll('{{ansprechpartner}}', vars.ansprechpartner || (vars.vorname ? `${vars.vorname} ${vars.nachname ?? ''}`.trim() : ''))
    .replaceAll('{{email}}', vars.email || '');
}
