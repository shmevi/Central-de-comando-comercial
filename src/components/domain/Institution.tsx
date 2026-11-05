import { useInstitutions } from '@/app/hooks';
import { Badge } from '@/components/ui/misc';
import { SelectField } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/form';

export function InstitutionBadge({ id }: { id: string | null | undefined }) {
  const { byId } = useInstitutions();
  if (!id) return <Badge className="border-dashed">Sem instituição</Badge>;
  const i = byId[id];
  if (!i) return <Badge>Instituição removida</Badge>;
  return <Badge color={i.color}>{i.name}</Badge>;
}

export function InstitutionSelect({ value, onChange, label = 'Instituição', error, required }: { value: string | null; onChange: (v: string | null) => void; label?: string; error?: string | null; required?: boolean }) {
  const { options } = useInstitutions();
  return <SelectField label={label} required={required} error={error} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} options={options} placeholder="Sem instituição" />;
}

export function InstitutionMulti({ value, onChange, label = 'Instituições' }: { value: string[]; onChange: (v: string[]) => void; label?: string }) {
  const { active } = useInstitutions();
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-4">
        {active.map((i) => (
          <Checkbox key={i.id} label={i.name} checked={value.includes(i.id)} onChange={(c) => onChange(c ? [...value, i.id] : value.filter((x) => x !== i.id))} />
        ))}
      </div>
    </fieldset>
  );
}
