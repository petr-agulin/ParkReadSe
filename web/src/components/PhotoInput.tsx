// Ввод: камера телефона через стандартный input, без библиотек.
//
// Отсюда снимок НЕ уходит наружу: выбранный файл идёт на экран выбора знака,
// где человек указывает знак и видит, что именно будет отправлено.

type Props = {
  busy: boolean;
  onPick: (file: File) => void;
  moment: string;
  onMoment: (value: string) => void;
};

export default function PhotoInput({ busy, onPick, moment, onMoment }: Props) {
  return (
    <section className="rounded-xl border border-line bg-ground p-4">
      <label className="block">
        <span className="mb-2 block text-[15px] font-semibold text-ink">
          Photograph of the sign
        </span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Сброс значения: иначе второй выбор того же файла не даёт события,
            // и «взять другой снимок» молча ничего не делает.
            e.target.value = "";
            if (file) onPick(file);
          }}
          className="block w-full cursor-pointer rounded-lg border border-line p-2
                     text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-accent
                     file:px-3 file:py-1.5 file:text-white disabled:opacity-50"
        />
      </label>

      <p className="mt-2 text-[12px] text-ink-3">
        You choose the sign on the next screen. Nothing leaves this device until then.
      </p>

      <label className="mt-3 block">
        <span className="mb-1 block text-[12px] text-ink-3">
          Moment to read the sign at — leave empty for now
        </span>
        <input
          type="datetime-local"
          value={moment}
          disabled={busy}
          onChange={(e) => onMoment(e.target.value)}
          className="rounded-lg border border-line px-2 py-1 text-[13px] disabled:opacity-50"
        />
      </label>
    </section>
  );
}
