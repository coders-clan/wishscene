import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage) {
    this.sent.push(message);
  }
}

// hunch-why: Magic links are credentials, so development never prints them to the console.
// Each message is a private file under the git-ignored apps/web/.data/dev-mail/.
export class FileOutboxMailer implements Mailer {
  constructor(private directory = join(process.cwd(), '.data', 'dev-mail')) {}
  async send(message: MailMessage) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const name = `${Date.now()}-${randomBytes(4).toString('hex')}.txt`;
    await writeFile(
      join(this.directory, name),
      `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`,
      { mode: 0o600 },
    );
  }
}
