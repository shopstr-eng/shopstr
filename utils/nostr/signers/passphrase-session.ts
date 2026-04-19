export type PassphrasePromptResult = {
  passphrase: string;
  remember: boolean;
};

type PassphraseRequester = (
  lastError?: Error
) => Promise<PassphrasePromptResult>;

type ConfiguredPassphraseGetter = () => string | undefined;

export class PassphraseSession {
  private rememberedPassphrase?: string;
  private inputPassphrase?: string;
  private inputPassphraseClearer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly requestPassphrase: PassphraseRequester,
    private readonly getConfiguredPassphrase?: ConfiguredPassphraseGetter,
    private readonly inputCacheMs: number = 5000
  ) {}

  public async getPassphrase(error?: Error): Promise<[string, boolean]> {
    const configuredPassphrase = this.getConfiguredPassphrase?.();
    if (configuredPassphrase) {
      return [configuredPassphrase, false];
    }

    if (this.rememberedPassphrase) {
      return [this.rememberedPassphrase, false];
    }

    if (this.inputPassphrase) {
      return [this.inputPassphrase, false];
    }

    const { passphrase, remember } = await this.requestPassphrase(error);
    return [passphrase || "", remember];
  }

  public registerSuccessfulPassphrase(
    passphrase: string,
    remember: boolean
  ): void {
    if (remember) {
      this.rememberedPassphrase = passphrase;
    }

    if (this.inputPassphraseClearer) {
      clearTimeout(this.inputPassphraseClearer);
    }

    this.inputPassphrase = passphrase;
    this.inputPassphraseClearer = setTimeout(() => {
      this.inputPassphrase = undefined;
      this.inputPassphraseClearer = undefined;
    }, this.inputCacheMs);
  }

  public clearRememberedPassphrase(): void {
    this.rememberedPassphrase = undefined;
  }

  public clearAll(): void {
    this.rememberedPassphrase = undefined;
    this.inputPassphrase = undefined;

    if (this.inputPassphraseClearer) {
      clearTimeout(this.inputPassphraseClearer);
      this.inputPassphraseClearer = undefined;
    }
  }
}
