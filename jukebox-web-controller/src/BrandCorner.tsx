const radioTeduLogoUrl = `${import.meta.env.BASE_URL}radiotedu-logo.png`;

export function RadioTeduCornerLogo() {
  return (
    <a className="radiotedu-corner-logo" href="https://radiotedu.com" aria-label="RadioTEDU">
      <img src={radioTeduLogoUrl} alt="RadioTEDU" />
      <span>RadioTEDU</span>
    </a>
  );
}
