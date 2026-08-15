export function SlashedZeroText({ value }: { value: string }) {
  if (!value) {
    return null;
  }

  return (
    <>
      {value.split(/(0)/g).map((part, index) =>
        part === "0" ? (
          <span key={index} className="slashed-zero">
            0
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}
