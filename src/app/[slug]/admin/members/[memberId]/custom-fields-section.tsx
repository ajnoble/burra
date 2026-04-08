type CustomFieldDisplay = {
  name: string;
  type: string;
  value: string;
};

export function CustomFieldsSection({
  fields,
}: {
  fields: CustomFieldDisplay[];
}) {
  if (fields.length === 0) return null;

  function formatValue(type: string, value: string): string {
    if (!value) return "\u2014";
    if (type === "checkbox") return value === "true" ? "Yes" : "No";
    return value;
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {fields.map((field) => (
        <div key={field.name}>
          <dt className="text-xs text-muted-foreground">{field.name}</dt>
          <dd className="text-sm">{formatValue(field.type, field.value)}</dd>
        </div>
      ))}
    </div>
  );
}
