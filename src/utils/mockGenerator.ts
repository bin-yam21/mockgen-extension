import type { Endpoint } from "../types/endpoint";
import { loadConfig } from "./config";

/* =========================
   MAIN FUNCTION
========================= */
export function generateMock(endpoint: Endpoint, rootPath?: string) {
  const { method, url } = endpoint;
 

  /* =========================
     CONFIG OVERRIDES
  ========================== */
  const config = rootPath ? loadConfig(rootPath) : { responseTemplates: {} };
  const template = config.responseTemplates?.[url];
if (template) {
  return {
    status: template.status ?? 200,
    headers: template.headers ?? { "content-type": "application/json" },
    body: template.body ?? template,
  };
}

  /* =========================
     STATUS CODE & SETUP
  ========================== */
  const resourceName = inferResourceName(url);
  const urlLower = url.toLowerCase();
  const urlParts = urlLower.split("/").filter(Boolean);
  const endpointType = inferEndpointType(urlLower, urlParts, method);
  
  let status = 200;
  // Auth and action endpoints typically return 200, not 201
  if (method === "POST" && endpointType !== "auth" && endpointType !== "action") {
    status = 201;
  }
  if (method === "DELETE") status = 204;

  /* =========================
     BODY GENERATION
  ========================== */
  let body: any = {};

  if (method === "GET" && isCollection(url)) {
    // Collection GET - return array
    body = [generateResponseBody(endpointType, urlLower, resourceName, 1), 
            generateResponseBody(endpointType, urlLower, resourceName, 2)];
  } else if (method === "GET") {
    // Single resource GET
    body = generateResponseBody(endpointType, urlLower, resourceName, extractId(url));
  } else if (method === "POST") {
    // POST - generate response based on endpoint type
    if (endpointType === "auth" || endpointType === "action") {
      body = generateResponseBody(endpointType, urlLower, resourceName, randomId());
    } else {
      body = { ...generateResponseBody(endpointType, urlLower, resourceName, randomId()), created: true };
    }
  } else if (method === "PUT" || method === "PATCH") {
    // PUT/PATCH - update response
    body = { ...generateResponseBody(endpointType, urlLower, resourceName, extractId(url)), updated: true };
  } else if (method === "DELETE") {
    return { status: 204 };
  }

  return {
    status,
    headers: { "content-type": "application/json" },
    body,
  };
}

/* =========================
   HELPERS
========================= */

/** Detect if URL points to a collection or single resource using pluralization */
function isCollection(url: string) {
  return !extractId(url);
}


/** Infer resource name from URL (singular form) */
function inferResourceName(url: string) {
  const clean = url.split("?")[0];
  const parts = clean.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "resource";
  // If collection (plural), convert to singular
  return last.endsWith("s") ? last.slice(0, -1) : last;
}

function extractId(url: string): number {
  const match = url.match(/\/(\d+)$/);
  return match ? Number(match[1]) : 1;
}

function randomId() {
  return Math.floor(Math.random() * 1000) + 1;
}

/**
 * Infer endpoint type from URL and method
 * Returns: "auth" | "action" | "crud" | "custom"
 */
function inferEndpointType(urlLower: string, urlParts: string[], method: string): string {
  // Authentication endpoints
  const authKeywords = ["login", "logout", "register", "signup", "sign-in", "sign-up", 
                        "forgot-password", "forgotpassword", "reset-password", "resetpassword",
                        "change-password", "changepassword", "verify", "verification", "auth"];
  
  // Action endpoints
  const actionKeywords = ["activate", "deactivate", "approve", "reject", "cancel", "submit",
                          "publish", "unpublish", "archive", "restore", "delete", "remove",
                          "send", "resend", "upload", "download", "export", "import"];
  
  const lastPart = urlParts[urlParts.length - 1] || "";
  const secondLastPart = urlParts[urlParts.length - 2] || "";
  
  // Check for auth patterns
  for (const keyword of authKeywords) {
    if (urlLower.includes(keyword) || lastPart.includes(keyword) || secondLastPart.includes(keyword)) {
      return "auth";
    }
  }
  
  // Check for action patterns
  for (const keyword of actionKeywords) {
    if (urlLower.includes(keyword) || lastPart.includes(keyword)) {
      return "action";
    }
  }
  
  return "crud";
}

/**
 * Generate response body based on endpoint type and resource name
 */
function generateResponseBody(endpointType: string, urlLower: string, resource: string, id: number): any {
  const resourceLower = resource.toLowerCase();
  
  // Authentication endpoints
  if (endpointType === "auth") {
    if (urlLower.includes("login") || urlLower.includes("sign-in") || urlLower.includes("signin")) {
      return {
        token: "mock-jwt-token-12345",
        refreshToken: "mock-refresh-token-67890",
        user: {
          id,
          email: "user@example.com",
          name: "John Doe",
          role: "user"
        },
        expiresIn: 3600
      };
    }
    
    if (urlLower.includes("register") || urlLower.includes("sign-up") || urlLower.includes("signup")) {
      return {
        id,
        email: "newuser@example.com",
        name: "New User",
        message: "Registration successful",
        verified: false
      };
    }
    
    if (urlLower.includes("forgot") || urlLower.includes("forgot-password") || urlLower.includes("forgotpassword")) {
      return {
        message: "Password reset link sent to your email",
        success: true,
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      };
    }
    
    if (urlLower.includes("reset-password") || urlLower.includes("resetpassword")) {
      return {
        message: "Password reset successfully",
        success: true,
        changedAt: new Date().toISOString()
      };
    }
    
    if (urlLower.includes("change-password") || urlLower.includes("changepassword") || urlLower.includes("change")) {
      return {
        message: "Password changed successfully",
        success: true,
        changedAt: new Date().toISOString()
      };
    }
    
    if (urlLower.includes("verify") || urlLower.includes("verification")) {
      return {
        verified: true,
        message: "Verification successful",
        verifiedAt: new Date().toISOString()
      };
    }
    
    // Generic auth response
    return {
      success: true,
      message: "Authentication successful",
      token: "mock-token"
    };
  }
  
  // Action endpoints
  if (endpointType === "action") {
    if (urlLower.includes("activate")) {
      return { id, active: true, activatedAt: new Date().toISOString() };
    }
    if (urlLower.includes("deactivate")) {
      return { id, active: false, deactivatedAt: new Date().toISOString() };
    }
    if (urlLower.includes("approve")) {
      return { id, approved: true, approvedAt: new Date().toISOString(), approvedBy: "admin" };
    }
    if (urlLower.includes("reject")) {
      return { id, rejected: true, rejectedAt: new Date().toISOString(), reason: "Does not meet requirements" };
    }
    if (urlLower.includes("publish")) {
      return { id, published: true, publishedAt: new Date().toISOString() };
    }
    if (urlLower.includes("archive")) {
      return { id, archived: true, archivedAt: new Date().toISOString() };
    }
    if (urlLower.includes("send") || urlLower.includes("resend")) {
      return { 
        message: "Message sent successfully", 
        sentAt: new Date().toISOString(),
        messageId: `msg-${id}`
      };
    }
    
    // Generic action response
    return { id, success: true, message: "Action completed successfully" };
  }
  
  // CRUD endpoints - generate based on resource type
  return generateResourceBody(resource, id);
}

/**
 * Generate body for CRUD resources based on resource name
 */
function generateResourceBody(resource: string, id: number): any {
  const resourceLower = resource.toLowerCase();
  
  // Common resource patterns
  if (resourceLower.includes("user") || resourceLower === "member" || resourceLower === "customer") {
    return {
      id,
      name: "John Doe",
      email: "john@example.com",
      role: "user",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  
  if (resourceLower.includes("product") || resourceLower === "item") {
    return {
      id,
      title: "Sample Product",
      description: "Product description",
      price: 49.99,
      currency: "USD",
      stock: 100,
      category: "electronics",
      sku: `SKU-${id}`,
      createdAt: new Date().toISOString()
    };
  }
  
  if (resourceLower.includes("order") || resourceLower === "purchase") {
    return {
      id,
      orderNumber: `ORD-${id}`,
      status: "pending",
      total: 99.99,
      currency: "USD",
      items: [],
      customerId: 1,
      createdAt: new Date().toISOString()
    };
  }
  
  if (resourceLower.includes("post") || resourceLower.includes("article") || resourceLower.includes("blog")) {
    return {
      id,
      title: "Sample Post Title",
      content: "Post content here...",
      author: "Author Name",
      published: true,
      publishedAt: new Date().toISOString(),
      tags: ["tag1", "tag2"]
    };
  }
  
  if (resourceLower.includes("comment")) {
    return {
      id,
      content: "This is a comment",
      author: "Commenter Name",
      postId: 1,
      createdAt: new Date().toISOString()
    };
  }
  
  if (resourceLower.includes("category") || resourceLower.includes("tag")) {
    return {
      id,
      name: capitalize(resource),
      slug: resourceLower,
      description: `${capitalize(resource)} description`,
      count: Math.floor(Math.random() * 100)
    };
  }
  
  if (resourceLower.includes("file") || resourceLower.includes("document") || resourceLower.includes("image")) {
    return {
      id,
      filename: `file-${id}.pdf`,
      url: `https://example.com/files/${id}`,
      size: 1024 * 100,
      mimeType: "application/pdf",
      uploadedAt: new Date().toISOString()
    };
  }
  
  if (resourceLower.includes("notification") || resourceLower.includes("message")) {
    return {
      id,
      title: "Notification Title",
      message: "Notification message",
      read: false,
      type: "info",
      createdAt: new Date().toISOString()
    };
  }
  
  if (resourceLower.includes("payment") || resourceLower.includes("transaction")) {
    return {
      id,
      amount: 99.99,
      currency: "USD",
      status: "completed",
      method: "credit_card",
      transactionId: `TXN-${id}`,
      createdAt: new Date().toISOString()
    };
  }
  
  if (resourceLower.includes("address")) {
    return {
      id,
      street: "123 Main St",
      city: "New York",
      state: "NY",
      zipCode: "10001",
      country: "USA"
    };
  }
  
  if (resourceLower.includes("review") || resourceLower.includes("rating")) {
    return {
      id,
      rating: 4.5,
      comment: "Great product!",
      userId: 1,
      productId: 1,
      createdAt: new Date().toISOString()
    };
  }
  
  if (resourceLower.includes("cart") || resourceLower.includes("basket")) {
    return {
      id,
      items: [],
      total: 0,
      currency: "USD",
      updatedAt: new Date().toISOString()
    };
  }
  
  // Default fallback - generate generic resource
  return {
    id,
    name: capitalize(resource) + " " + id,
    description: `${capitalize(resource)} description`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Generate request body example based on endpoint URL and method
 * This is different from response body - it represents what the client sends
 */
export function generateRequestBody(endpoint: Endpoint): any {
  const { method, url } = endpoint;
  const urlLower = url.toLowerCase();
  const urlParts = urlLower.split("/").filter(Boolean);
  const lastPart = urlParts[urlParts.length - 1] || "";
  const resourceName = inferResourceName(url);
  
  // Only generate request bodies for POST, PUT, PATCH
  if (!["POST", "PUT", "PATCH"].includes(method)) {
    return {};
  }
  
  // Authentication endpoints - request bodies
  if (urlLower.includes("login") || urlLower.includes("sign-in") || urlLower.includes("signin")) {
    return {
      email: "user@example.com",
      password: "password123"
    };
  }
  
  if (urlLower.includes("register") || urlLower.includes("sign-up") || urlLower.includes("signup")) {
    return {
      email: "newuser@example.com",
      password: "password123",
      confirmPassword: "password123",
      name: "New User"
    };
  }
  
  if (urlLower.includes("forgot-password") || urlLower.includes("forgotpassword")) {
    return {
      email: "user@example.com"
    };
  }
  
  if (urlLower.includes("reset-password") || urlLower.includes("resetpassword")) {
    return {
      token: "reset-token-12345",
      newPassword: "newpassword123",
      confirmPassword: "newpassword123"
    };
  }
  
  if (urlLower.includes("change-password") || urlLower.includes("changepassword")) {
    return {
      currentPassword: "oldpassword123",
      newPassword: "newpassword123",
      confirmPassword: "newpassword123"
    };
  }
  
  if (urlLower.includes("password")) {
    return {
      prevPassword: "oldpassword123",
      newPassword: "newpassword123",
      confirmPassword: "newpassword123"
    };
  }
  
  // Generate request body based on resource type
  return generateResourceRequestBody(resourceName, urlLower);
}

/**
 * Generate request body for CRUD resources
 */
function generateResourceRequestBody(resource: string, urlLower: string): any {
  const resourceLower = resource.toLowerCase();
  
  if (resourceLower.includes("user") || resourceLower === "member" || resourceLower === "customer") {
    return {
      name: "John Doe",
      email: "john@example.com",
      role: "user",
      phone: "+1234567890"
    };
  }
  
  if (resourceLower.includes("product") || resourceLower === "item") {
    return {
      title: "New Product",
      description: "Product description",
      price: 49.99,
      currency: "USD",
      stock: 100,
      category: "electronics",
      sku: "SKU-001"
    };
  }
  
  if (resourceLower.includes("order") || resourceLower === "purchase") {
    return {
      items: [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 }
      ],
      shippingAddress: {
        street: "123 Main St",
        city: "New York",
        state: "NY",
        zipCode: "10001",
        country: "USA"
      }
    };
  }
  
  if (resourceLower.includes("post") || resourceLower.includes("article") || resourceLower.includes("blog")) {
    return {
      title: "New Post Title",
      content: "Post content here...",
      tags: ["tag1", "tag2"],
      published: false
    };
  }
  
  if (resourceLower.includes("comment")) {
    return {
      content: "This is a comment",
      postId: 1
    };
  }
  
  if (resourceLower.includes("review") || resourceLower.includes("rating")) {
    return {
      rating: 4.5,
      comment: "Great product!",
      productId: 1
    };
  }
  
  if (resourceLower.includes("address")) {
    return {
      street: "123 Main St",
      city: "New York",
      state: "NY",
      zipCode: "10001",
      country: "USA"
    };
  }
  
  if (resourceLower.includes("file") || resourceLower.includes("document") || resourceLower.includes("image")) {
    return {
      filename: "document.pdf",
      file: "base64encodedfilecontent"
    };
  }
  
  if (resourceLower.includes("notification") || resourceLower.includes("message")) {
    return {
      title: "Notification Title",
      message: "Notification message",
      recipientId: 1,
      type: "info"
    };
  }
  
  if (resourceLower.includes("payment") || resourceLower.includes("transaction")) {
    return {
      amount: 99.99,
      currency: "USD",
      method: "credit_card",
      cardNumber: "4111111111111111",
      cvv: "123",
      expiryDate: "12/25"
    };
  }
  
  // Default generic request body
  return {
    name: capitalize(resource),
    description: `${capitalize(resource)} description`
  };
}

/** Simple capitalize helper */
function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Simple pluralization check (ends with "s") */
function pluralize(str: string) {
  // Very basic; assumes English-style plural by adding "s"
  return str.endsWith("s") ? str : str + "s";
}
