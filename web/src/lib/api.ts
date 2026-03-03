// Mock API module for standalone PDF reader

type RequestOptions = {
  headers?: Record<string, string>;
};

class MockApi {
  async get<T>(url: string, _options?: RequestOptions): Promise<T> {
    console.log("[Mock API] GET:", url);
    
    // Return appropriate mock data based on endpoint
    if (url.includes("/annotations")) {
      // Return empty array for annotations
      return [] as T;
    }
    if (url.includes("/pdf-notes")) {
      // Return empty notes
      return { id: 0, content: "" } as T;
    }
    if (url.includes("/categories")) {
      // Return empty array for categories
      return [] as T;
    }
    
    // Default: return empty object
    return {} as T;
  }

  async post<T>(url: string, data?: unknown, _options?: RequestOptions): Promise<T> {
    console.log("[Mock API] POST:", url, data);
    
    // For annotation creation, return full data (including sent data and generated id)
    if (url.includes("/annotations")) {
      const postData = data as Record<string, unknown> || {};
      return { 
        id: `mock-annotation-${Date.now()}`,
        type: postData.type || "highlight",
        pageNumber: postData.pageNumber || 1,
        rects: postData.rects || [],
        content: postData.content || "",
        color: postData.color || "#FCD34D",
        sentenceIds: postData.sentenceIds || [],
        createTime: Date.now(),
      } as T;
    }
    
    // Default: return response with id
    return { 
      id: `mock-${Date.now()}`,
      ...(data as object || {}),
    } as T;
  }

  async put<T>(url: string, _data?: unknown, _options?: RequestOptions): Promise<T> {
    console.log("[Mock API] PUT:", url);
    return {} as T;
  }

  async delete<T>(url: string, _options?: RequestOptions): Promise<T> {
    console.log("[Mock API] DELETE:", url);
    return {} as T;
  }
}

export const api = new MockApi();
