"use client";

const mockTransactions = [
  { name: "Position A", action: "Buy", delta: "+100" },
  { name: "Position B", action: "Sell", delta: "-50" },
  { name: "Position C", action: "Buy", delta: "+200" },
  { name: "Position A", action: "Sell", delta: "-75" },
  { name: "Position B", action: "Buy", delta: "+150" },
  { name: "Position C", action: "Sell", delta: "-100" },
  { name: "Position A", action: "Buy", delta: "+125" },
  { name: "Position B", action: "Sell", delta: "-25" },
  { name: "Position C", action: "Buy", delta: "+175" },
  { name: "Position A", action: "Sell", delta: "-50" },
];

export function Transactions() {
  return (
    <section className="bg-base-100 border border-base-300 rounded-3xl p-4 shadow-md flex flex-col gap-4">
      <h3 className="text-xl font-semibold">Transactions</h3>
      <div className="divide-y divide-base-300">
        {mockTransactions.map((tx, idx) => (
          <div key={`${tx.name}-${idx}`} className="py-3 flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">{tx.name}</div>
              <span className="link text-sm">{tx.action}</span>
            </div>
            <span className={`text-sm ${tx.delta.startsWith("+") ? "text-success" : "text-error"}`}>{tx.delta}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
