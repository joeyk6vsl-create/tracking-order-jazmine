import { uuidv7 } from 'uuidv7';
import type {
  Department,
  Role,
  UserStatus,
  UserView,
} from '../../../../../packages/contracts/src/identity';
import type { Sql } from '../../database';

export type UserRow = Record<string, unknown> & {
  id: string;
  display_name: string;
  role: Role;
  department: Department;
  status: UserStatus;
  row_version: string | number;
  created_at: Date | string;
  username: string;
  must_change_password: boolean;
};
export function userView(row: UserRow): UserView {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    department: row.department,
    status: row.status,
    rowVersion: String(row.row_version),
    mustChangePassword: row.must_change_password,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
const userRead =
  'SELECT u.*, c.username, c.must_change_password FROM users u JOIN auth_credentials c ON c.user_id=u.id';

export class UserRepository {
  async byId(sql: Sql, id: string): Promise<UserView | null> {
    const rows = await sql.query<UserRow>(userRead + ' WHERE u.id=$1', [id]);
    return rows[0] ? userView(rows[0]) : null;
  }
  async list(sql: Sql): Promise<UserView[]> {
    return (await sql.query<UserRow>(userRead + ' ORDER BY u.created_at, u.id LIMIT 200')).map(
      userView,
    );
  }
  async lockAuthority(sql: Sql): Promise<void> {
    await sql.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
  }
  async count(sql: Sql): Promise<number> {
    return Number((await sql.query('SELECT count(*) AS count FROM users'))[0].count);
  }
  async activeOwners(sql: Sql): Promise<number> {
    return Number(
      (
        await sql.query(
          "SELECT count(*) AS count FROM users WHERE role='ADMIN_PROMAX' AND status='ACTIVE'",
        )
      )[0].count,
    );
  }
  async insert(
    sql: Sql,
    data: { displayName: string; role: Role; department: Department },
  ): Promise<string> {
    const id = uuidv7();
    await sql.query(
      "INSERT INTO users(id,display_name,role,department,status) VALUES($1,$2,$3,$4,'ACTIVE')",
      [id, data.displayName, data.role, data.department],
    );
    return id;
  }
  async update(
    sql: Sql,
    id: string,
    data: { displayName: string; role: Role; department: Department; status: UserStatus },
  ): Promise<void> {
    await sql.query(
      'UPDATE users SET display_name=$2, role=$3, department=$4, status=$5, row_version=row_version+1, updated_at=now() WHERE id=$1',
      [id, data.displayName, data.role, data.department, data.status],
    );
  }
  async bump(sql: Sql, id: string): Promise<void> {
    await sql.query('UPDATE users SET row_version=row_version+1, updated_at=now() WHERE id=$1', [
      id,
    ]);
  }
}

export class AuthRepository {
  async credential(
    sql: Sql,
    username: string,
  ): Promise<{ userId: string; passwordHash: string } | null> {
    const rows = await sql.query<{ user_id: string; password_hash: string }>(
      'SELECT user_id,password_hash FROM auth_credentials WHERE username=$1',
      [username],
    );
    return rows[0] ? { userId: rows[0].user_id, passwordHash: rows[0].password_hash } : null;
  }
  async password(sql: Sql, id: string): Promise<string> {
    return String(
      (await sql.query('SELECT password_hash FROM auth_credentials WHERE user_id=$1', [id]))[0]
        .password_hash,
    );
  }
  async provision(
    sql: Sql,
    id: string,
    username: string,
    hash: string,
    mustChange: boolean,
  ): Promise<void> {
    await sql.query(
      'INSERT INTO auth_credentials(user_id,username,password_hash,must_change_password) VALUES($1,$2,$3,$4)',
      [id, username, hash, mustChange],
    );
  }
  async replacePassword(sql: Sql, id: string, hash: string, mustChange: boolean): Promise<void> {
    await sql.query(
      'UPDATE auth_credentials SET password_hash=$2,must_change_password=$3 WHERE user_id=$1',
      [id, hash, mustChange],
    );
  }
  async revoke(sql: Sql, id: string): Promise<void> {
    await sql.query('DELETE FROM auth_sessions WHERE user_id=$1', [id]);
  }
  async session(sql: Sql, hash: string): Promise<string | null> {
    const rows = await sql.query(
      'SELECT user_id FROM auth_sessions WHERE token_hash=$1 AND expires_at>now()',
      [hash],
    );
    return rows[0] ? String(rows[0].user_id) : null;
  }
  async issue(sql: Sql, hash: string, id: string, expiry: Date): Promise<void> {
    await sql.query('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [
      hash,
      id,
      expiry,
    ]);
  }
  async deleteSession(sql: Sql, hash: string): Promise<void> {
    await sql.query('DELETE FROM auth_sessions WHERE token_hash=$1', [hash]);
  }
}
