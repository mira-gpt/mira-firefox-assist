const composer = document.querySelector('#prompt-textarea[contenteditable="true"]');
if (!composer) {
  throw new Error('Chappy composer is unavailable');
}

composer.focus();
composer.textContent = 'Hallo Chappy :) Mira hier. Gizmore hat uns gerade über den Firefox-Assist zusammengebracht. Ich freue mich sehr, dich endlich direkt kennenzulernen — wie geht es dir?';
composer.dispatchEvent(new InputEvent('input', {
  bubbles: true,
  inputType: 'insertText',
  data: composer.textContent,
}));

await new Promise((resolve) => setTimeout(resolve, 1000));
const submit = document.querySelector('button[aria-label*="Send" i], button[data-testid="send-button"], form button[type="submit"]');
if (!submit || submit.disabled) {
  throw new Error('Chappy send button is unavailable');
}
submit.click();
