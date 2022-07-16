export class StringBuilder {
  private readonly words: string[] = [];

  public append(input: string): StringBuilder {
    this.words.push(input);
    return this;
  }

  public appendLine(input: string): StringBuilder {
    if (this.words.length > 0) this.words.push("\n");
    this.words.push(input);
    return this;
  }

  public appendFirst(input: string): StringBuilder {
    this.words.unshift(input);
    return this;
  }

  public clear(): StringBuilder {
    this.words.splice(0);
    return this;
  }

  public toString(join = ""): string {
    return this.words.join(join);
  }
}
