"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminClient = getAdminClient;
exports.fetchShopInfo = fetchShopInfo;
exports.fetchProducts = fetchProducts;
exports.fetchProductVariants = fetchProductVariants;
exports.fetchInventoryLevels = fetchInventoryLevels;
var shopify_1 = require("@/lib/shopify");
var prisma_1 = require("@/lib/db/prisma");
var shopify_api_1 = require("@shopify/shopify-api");
var graphql_1 = require("@/services/shopify/graphql");
function getAdminClient(shopDomain) {
    return __awaiter(this, void 0, void 0, function () {
        var store, maskedToken, session, client;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("[AdminClient] Initializing getAdminClient for shop:", shopDomain);
                    return [4 /*yield*/, prisma_1.prisma.store.findUnique({
                            where: { shopDomain: shopDomain },
                        })];
                case 1:
                    store = _a.sent();
                    console.log("[AdminClient] Store record query result:", {
                        found: Boolean(store),
                        isActive: store === null || store === void 0 ? void 0 : store.isActive,
                        hasAccessToken: Boolean(store === null || store === void 0 ? void 0 : store.accessToken),
                    });
                    if (!store || !store.isActive) {
                        throw new Error("Store ".concat(shopDomain, " is not active or not found."));
                    }
                    maskedToken = store.accessToken
                        ? "".concat(store.accessToken.substring(0, 10), "...").concat(store.accessToken.substring(store.accessToken.length - 4))
                        : "null";
                    console.log("[AdminClient] Instantiating offline Session with token:", maskedToken);
                    session = new shopify_api_1.Session({
                        id: "offline_".concat(shopDomain),
                        shop: shopDomain,
                        state: "offline",
                        isOnline: false,
                        accessToken: store.accessToken,
                    });
                    client = new shopify_1.shopify.clients.Graphql({ session: session });
                    console.log("[AdminClient] GraphQL client initialized successfully.");
                    return [2 /*return*/, client];
            }
        });
    });
}
function handleGraphQLError(error, shopDomain) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (error instanceof shopify_api_1.GraphqlQueryError) {
                        console.error("GraphQL Query Error for ".concat(shopDomain, ":"), JSON.stringify(error.response, null, 2));
                        throw new Error("Shopify GraphQL Error: ".concat(error.message));
                    }
                    if (!(((_a = error.response) === null || _a === void 0 ? void 0 : _a.code) === 401 || ((_b = error.response) === null || _b === void 0 ? void 0 : _b.status) === 401 || error.statusCode === 401)) return [3 /*break*/, 2];
                    console.warn("Access token invalid for ".concat(shopDomain, ". Marking store as inactive."));
                    return [4 /*yield*/, prisma_1.prisma.store.update({
                            where: { shopDomain: shopDomain },
                            data: { isActive: false },
                        })];
                case 1:
                    _c.sent();
                    throw new Error("Unauthorized: Store ".concat(shopDomain, " marked as inactive."));
                case 2: throw error;
            }
        });
    });
}
function fetchShopInfo(shopDomain) {
    return __awaiter(this, void 0, void 0, function () {
        var client, response, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getAdminClient(shopDomain)];
                case 1:
                    client = _b.sent();
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, client.request(graphql_1.SHOP_INFO_QUERY)];
                case 3:
                    response = _b.sent();
                    return [2 /*return*/, (_a = response.data) === null || _a === void 0 ? void 0 : _a.shop];
                case 4:
                    error_1 = _b.sent();
                    return [2 /*return*/, handleGraphQLError(error_1, shopDomain)];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function fetchProducts(shopDomain_1) {
    return __awaiter(this, arguments, void 0, function (shopDomain, first) {
        var client, response, error_2;
        var _a;
        if (first === void 0) { first = 10; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getAdminClient(shopDomain)];
                case 1:
                    client = _b.sent();
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, client.request(graphql_1.GET_PRODUCTS_BASIC_QUERY, { variables: { first: first } })];
                case 3:
                    response = _b.sent();
                    return [2 /*return*/, (_a = response.data) === null || _a === void 0 ? void 0 : _a.products];
                case 4:
                    error_2 = _b.sent();
                    return [2 /*return*/, handleGraphQLError(error_2, shopDomain)];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function fetchProductVariants(shopDomain_1, productId_1) {
    return __awaiter(this, arguments, void 0, function (shopDomain, productId, first) {
        var client, response, error_3;
        var _a, _b;
        if (first === void 0) { first = 50; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, getAdminClient(shopDomain)];
                case 1:
                    client = _c.sent();
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, client.request(graphql_1.GET_PRODUCT_VARIANTS_QUERY, { variables: { id: productId, first: first } })];
                case 3:
                    response = _c.sent();
                    return [2 /*return*/, (_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.product) === null || _b === void 0 ? void 0 : _b.variants];
                case 4:
                    error_3 = _c.sent();
                    return [2 /*return*/, handleGraphQLError(error_3, shopDomain)];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function fetchInventoryLevels(shopDomain, inventoryItemId) {
    return __awaiter(this, void 0, void 0, function () {
        var client, response, error_4;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, getAdminClient(shopDomain)];
                case 1:
                    client = _c.sent();
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, client.request(graphql_1.GET_INVENTORY_LEVELS_QUERY, { variables: { id: inventoryItemId } })];
                case 3:
                    response = _c.sent();
                    return [2 /*return*/, (_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.inventoryItem) === null || _b === void 0 ? void 0 : _b.inventoryLevels];
                case 4:
                    error_4 = _c.sent();
                    return [2 /*return*/, handleGraphQLError(error_4, shopDomain)];
                case 5: return [2 /*return*/];
            }
        });
    });
}
