// Ввод: камера телефона через стандартный input, без библиотек.

type Props = {
  busy: boolean;
  onPick: (file: File) => void;
  moment: string;
  onMoment: (value: string) => void;
};

export default function PhotoInput({ busy, onPick, moment, onMoment }: Props) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">
          Photograph of the sign
        </span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPick(file);
          }}
          className="block w-full cursor-pointer rounded-lg border border-slate-300 p-2
                     text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-800
                     file:px-3 file:py-1.5 file:text-white hover:file:bg-slate-700
                     disabled:opacity-50"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs text-slate-500">
          Moment to read the sign at — leave empty for now
        </span>
        <input
          type="datetime-local"
          value={moment}
          disabled={busy}
          onChange={(e) => onMoment(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
        />
      </label>

      {busy && <p className="mt-3 text-sm text-slate-500">Reading the sign…</p>}
    </section>
  );
}
