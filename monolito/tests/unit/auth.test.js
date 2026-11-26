import test from "node:test";
import assert from "node:assert/strict";
import { createToken, requireRole, verifyPassword, hashPassword } from "../../src/compartilhado/auth.js";
import { AppError } from "../../src/compartilhado/errors.js";

process.env.TOKEN_SECRET = "test-secret-with-at-least-thirty-two-characters";

test("RFA2: tokens autenticam o perfil e negam perfil incorreto ou ausente", () => {
  const token = createToken("123e4567-e89b-42d3-a456-426614174000", "CLIENTE");
  assert.equal(requireRole({ headers: { authorization: `Bearer ${token}` } }, ["CLIENTE"]).role, "CLIENTE");
  assert.throws(() => requireRole({ headers: { authorization: `Bearer ${token}` } }, ["BARBEARIA"]),
    (error) => error instanceof AppError && error.status === 403);
  assert.throws(() => requireRole({ headers: {} }, ["CLIENTE"]),
    (error) => error instanceof AppError && error.status === 401);
});

test("RFA2/RNF4: senhas são armazenadas como hash verificável, nunca em texto puro", async () => {
  const hash = await hashPassword("segredo-de-teste");
  assert.notEqual(hash, "segredo-de-teste");
  assert.equal(await verifyPassword("segredo-de-teste", hash), true);
  assert.equal(await verifyPassword("senha-incorreta", hash), false);
});
