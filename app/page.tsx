import Link from "next/link";

// Placeholder home page. The real dashboard (counts, low stock, recent
// orders and shipments) is step 19 of the plan.
export default function Home() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">Enterprise Supply Chain</h1>
      <p className="mt-2 text-slate-600">
        The dashboard comes later. For now, start with the product catalogue.
      </p>
      <Link
        href="/products"
        className="mt-6 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Go to products
      </Link>
    </div>
  );
}
