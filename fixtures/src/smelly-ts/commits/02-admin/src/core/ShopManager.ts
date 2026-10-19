/** Everything the admin panel needs, in one place. */
export class ShopManager {
  private users = new Map<string, string>();
  private stock = new Map<string, number>();
  private outbox: string[] = [];
  private ledger: number[] = [];
  private auditLog: string[] = [];

  addUser(id: string, name: string): void {
    this.users.set(id, name);
  }

  removeUser(id: string): boolean {
    return this.users.delete(id);
  }

  findUser(id: string): string | undefined {
    return this.users.get(id);
  }

  countUsers(): number {
    return this.users.size;
  }

  renameUser(id: string, name: string): void {
    if (this.users.has(id)) this.users.set(id, name);
  }

  exportUsers(): string[] {
    return [...this.users.values()].sort();
  }

  addStock(sku: string, quantity: number): void {
    this.stock.set(sku, this.stockLevel(sku) + quantity);
  }

  removeStock(sku: string, quantity: number): void {
    this.stock.set(sku, Math.max(0, this.stockLevel(sku) - quantity));
  }

  stockLevel(sku: string): number {
    return this.stock.get(sku) ?? 0;
  }

  isInStock(sku: string): boolean {
    return this.stockLevel(sku) > 0;
  }

  queueEmail(to: string): void {
    this.outbox.push(to);
  }

  outboxSize(): number {
    return this.outbox.length;
  }

  clearOutbox(): void {
    this.outbox = [];
  }

  recordPayment(cents: number): void {
    this.ledger.push(cents);
  }

  refundPayment(cents: number): void {
    this.ledger.push(-cents);
  }

  balance(): number {
    return this.ledger.reduce((sum, cents) => sum + cents, 0);
  }

  paymentCount(): number {
    return this.ledger.length;
  }

  log(entry: string): void {
    this.auditLog.push(entry);
  }

  lastLogEntry(): string | undefined {
    return this.auditLog.at(-1);
  }

  logSize(): number {
    return this.auditLog.length;
  }

  clearLog(): void {
    this.auditLog = [];
  }

  reset(): void {
    this.users.clear();
    this.stock.clear();
    this.clearOutbox();
    this.ledger = [];
    this.clearLog();
  }
}
