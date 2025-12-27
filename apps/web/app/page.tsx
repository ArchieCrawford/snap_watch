import SearchPage from "../components/SearchPage";
import { fetchSearch } from "../lib/api";

export default async function Home({
  searchParams,
}: {
  searchParams: { q?: string; tab?: string };
}) {
  const q = searchParams.q || "";
  const data = q ? await fetchSearch(q) : null;
  return (
    <SearchPage
      initialQuery={q}
      initialData={data}
      initialTab={searchParams.tab}
    />
  );
}
