// Packing Type picker for the Enquiry / Quote / Order / Dispatch line-items
// tables: a plain <select> over the packing_types list (usePackingTypes, in
// sort_order). A saved value that isn't in the list (pre-2026-10-17 names
// like "HDPE Barrel") is added as an extra option, so it shows instead of
// blank and is kept on save unless the user picks something else.
interface Props {
  options: string[];
  value: string;
  onChange: (val: string) => void;
}

export function PackingTypeSelect({ options, value, onChange }: Props) {
  const opts = value && !options.includes(value) ? [...options, value] : options;
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`w-full bg-transparent outline-none font-sans text-[12px] cursor-pointer ${value ? 'text-blk' : 'text-g400'}`}
    >
      <option value="">Select packing type</option>
      {opts.map(o => <option key={o} value={o} className="text-blk">{o}</option>)}
    </select>
  );
}
