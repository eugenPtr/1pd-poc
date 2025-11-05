"use client";

import { type UseQueryResult, useQuery } from "@tanstack/react-query";

const IMAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function loadImageAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "force-cache",
    headers: { Accept: "image/*" },
  });

  if (!response.ok) {
    throw new Error(`Failed to load image (${response.status})`);
  }

  const blob = await response.blob();

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new Error("Unexpected image data type"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read image blob"));
    reader.readAsDataURL(blob);
  });
}

export function useCachedImage(imageUrl?: string): UseQueryResult<string, Error> {
  return useQuery({
    queryKey: ["positionImage", imageUrl],
    enabled: Boolean(imageUrl),
    staleTime: IMAGE_CACHE_TTL_MS,
    gcTime: IMAGE_CACHE_TTL_MS,
    queryFn: async () => {
      if (!imageUrl) {
        throw new Error("Image URL required");
      }
      return loadImageAsDataUrl(imageUrl);
    },
  });
}
