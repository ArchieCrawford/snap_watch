export const getApiBase = () => {
  return (
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:4000"
  );
};

const safeFetch = async <T>(url: string): Promise<T | null> => {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
};

export const fetchSearch = async (q: string, cursor = 0, limit = 20) => {
  const url = `${getApiBase()}/search?q=${encodeURIComponent(q)}&cursor=${cursor}&limit=${limit}`;
  return safeFetch<any>(url);
};

export const fetchTopicOrigin = async (topicId: string) => {
  const url = `${getApiBase()}/topic/${topicId}/origin`;
  return safeFetch<any>(url);
};

export const fetchTopicSpread = async (topicId: string) => {
  const url = `${getApiBase()}/topic/${topicId}/spread`;
  return safeFetch<any>(url);
};

export const fetchUser = async (fid: string) => {
  const url = `${getApiBase()}/fid/${fid}`;
  return safeFetch<any>(url);
};

export const fetchThread = async (rootHash: string) => {
  const url = `${getApiBase()}/thread/${rootHash}`;
  return safeFetch<any>(url);
};
