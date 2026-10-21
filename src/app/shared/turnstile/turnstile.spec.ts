import { loadTurnstileScript, TURNSTILE_SCRIPT_SRC } from './turnstile';

describe('loadTurnstileScript', () => {
  const scripts = () => document.querySelectorAll(`script[src="${TURNSTILE_SCRIPT_SRC}"]`);

  afterEach(() => scripts().forEach((script) => script.remove()));

  it('is not loaded until a widget asks for it', () => {
    expect(scripts().length).toBe(0);
  });

  it('injects the Turnstile API once', () => {
    loadTurnstileScript();
    loadTurnstileScript();

    expect(scripts().length).toBe(1);
    expect((scripts()[0] as HTMLScriptElement).async).toBe(true);
  });
});
