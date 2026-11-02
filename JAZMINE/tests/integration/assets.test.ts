import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Database } from '../../apps/server/src/database';
import { AuthService } from '../../apps/server/src/identity/application/auth-service';
import { UserService } from '../../apps/server/src/identity/application/user-service';
import { AssetService } from '../../apps/server/src/assets/asset-service';
import { validateAsset } from '../../apps/server/src/assets/file-validation';
import {
  ASSET_KINDS,
  uploadAssetSchema,
  reviewAssetSchema,
} from '../../packages/contracts/src/assets';
import { createApplication } from '../../apps/server/src/app';
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
test('file checks reject active formats, oversized files, invalid base64 and unsafe names', () => {
  assert.equal(validateAsset(png).mime, 'image/png');
  assert.throws(() =>
    validateAsset(Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64')),
  );
  assert.throws(() => validateAsset(Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')));
  assert.throws(() => validateAsset('!!!!'));
  assert.equal(
    uploadAssetSchema.safeParse({
      draftId: randomUUID(),
      kind: 'MOCKUP',
      filename: '../x.png',
      base64: png,
    }).success,
    false,
  );
  assert.equal(reviewAssetSchema.safeParse({ decision: 'APPROVED', reason: '' }).success, false);
});
test('graphic files preserve versions, enforce approvals, share central branding and invalidate draft artwork', async () => {
  const db = await Database.open({ dataDir: ':memory:' });
  try {
    await db.migrate();
    const auth = new AuthService(db, true),
      password = 'Assets-strong-password-123';
    await auth.bootstrap({ username: 'assets.owner', displayName: 'Owner', password });
    const owner = (await auth.login('assets.owner', password, '127.0.0.1')).user;
    const users = new UserService(db, auth),
      actors = [];
    for (const department of ['ADMIN', 'GRAPHIC', 'PRINTING'] as const) {
      const username = 'asset.' + department.toLowerCase();
      let actor = await users.create(owner, {
        username,
        displayName: department,
        password,
        role: 'STAFF',
        department,
      });
      await auth.changePassword(actor, {
        currentPassword: password,
        newPassword: password + 'new',
      });
      actor = (await auth.login(username, password + 'new', '127.0.0.1')).user;
      actors.push(actor);
    }
    const [admin, graphic, printing] = actors,
      service = new AssetService(db);
    const first = randomUUID(),
      second = randomUUID();
    for (const id of [first, second]) {
      const input = {
        customerName: 'Customer',
        brandingType: 'JAZMINE_STANDARD',
        customerId: null,
      };
      await db.query(
        'INSERT INTO order_drafts(id,input_json,quote_json,selection_json,request_hash,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6)',
        [id, JSON.stringify(input), '{}', '[]', 'test', owner.id],
      );
    }
    await assert.rejects(service.queue(printing));
    const queue = await service.queue(graphic);
    assert.equal(queue.drafts.length, 2);
    assert.equal('pricing' in queue.drafts[0], false);
    assert.equal('phone' in queue.drafts[0], false);
    assert.equal((await service.checklist(admin, first)).ready, false);
    for (const kind of ASSET_KINDS) {
      const id = randomUUID(),
        data = { draftId: first, kind, filename: kind + '.png', base64: png };
      await service.upload(admin, id, data);
      await service.upload(admin, id, data);
      await assert.rejects(service.review(admin, id, 'APPROVED', 'Admin cannot approve'));
      await service.review(graphic, id, 'APPROVED', 'ตรวจแล้วตรงแบบ');
      await service.review(graphic, id, 'APPROVED', 'ตรวจแล้วตรงแบบ');
      assert.equal((await service.content(graphic, id)).bytes.toString('base64'), png);
    }
    assert.equal((await service.checklist(admin, first)).ready, true);
    const shared = await service.checklist(graphic, second);
    assert.equal(shared.assets.length, 2);
    assert.equal(shared.missing.length, 1);
    const old = (await service.checklist(admin, first)).assets.find((a) => a.kind === 'MOCKUP')!;
    await db.query('UPDATE order_drafts SET row_version=2 WHERE id=$1', [first]);
    assert.equal((await service.checklist(admin, first)).ready, false);
    assert.equal(
      (await service.checklist(admin, first)).assets.find((a) => a.id === old.id)?.stale,
      true,
    );
    const replacement = randomUUID();
    await service.upload(graphic, replacement, {
      draftId: first,
      kind: 'MOCKUP',
      filename: 'v2.png',
      base64: png,
    });
    await service.review(graphic, replacement, 'REJECTED', 'ตำแหน่งโลโก้ไม่ตรง');
    await assert.rejects(service.review(graphic, replacement, 'APPROVED', 'เปลี่ยนใจ'));
    const newest = randomUUID();
    await service.upload(graphic, newest, {
      draftId: first,
      kind: 'MOCKUP',
      filename: 'v3.png',
      base64: png,
    });
    await service.review(owner, newest, 'APPROVED', 'แก้ตรงแล้ว');
    assert.equal((await service.checklist(admin, first)).ready, true);
    assert.equal(
      (await service.checklist(admin, first)).assets.filter((a) => a.kind === 'MOCKUP').length,
      3,
    );
    const pending = randomUUID();
    await service.upload(admin, pending, {
      draftId: first,
      kind: 'MOCKUP',
      filename: 'pending.png',
      base64: png,
    });
    await db.query('UPDATE order_drafts SET row_version=3 WHERE id=$1', [first]);
    await assert.rejects(service.review(graphic, pending, 'APPROVED', 'ใช้ฉบับเก่าไม่ได้'));
    await db.query('UPDATE order_drafts SET input_json=$2 WHERE id=$1', [
      second,
      JSON.stringify({
        customerName: 'Guest custom',
        customerId: null,
        brandingType: 'CUSTOM_AGENT',
      }),
    ]);
    const guest = randomUUID();
    await service.upload(admin, guest, {
      draftId: second,
      kind: 'NECK_LABEL',
      filename: 'guest.png',
      base64: png,
    });
    assert.equal(
      (await service.checklist(admin, second)).assets.filter((a) => a.kind === 'NECK_LABEL').length,
      1,
    );
    await assert.rejects(service.content(printing, guest));
    const app = await createApplication(
      { production: false, port: 3100, origin: 'http://localhost:5173', dataDir: ':memory:' },
      db,
      false,
    );
    try {
      const token = (await auth.login('asset.graphic', password + 'new', '127.0.0.1')).token;
      const http = app.getHttpAdapter().getInstance();
      assert.equal(
        (await http.inject({ method: 'GET', url: `/api/v1/graphic-assets/${newest}/content` }))
          .statusCode,
        401,
      );
      const response = await http.inject({
        method: 'GET',
        url: `/api/v1/graphic-assets/${newest}/content`,
        headers: { cookie: 'jazmine_session=' + token },
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers['content-type'], 'image/png');
      assert.equal(response.rawPayload.toString('base64'), png);
    } finally {
      await app.close();
    }
  } finally {
    await db.close();
  }
});
