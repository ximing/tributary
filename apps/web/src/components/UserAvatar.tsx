import type { PublicUser } from '../api/client.js';

/** 头像：有图显示图，否则用昵称/邮箱首字符的朱砂底圆徽 */
export function UserAvatar({ user, size = 26 }: { user: PublicUser | null; size?: number }) {
  const label = user?.displayName || user?.email || '?';
  const initial = Array.from(label)[0]?.toUpperCase() ?? '?';
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.48 }} aria-hidden>
      {user?.avatar ? <img src={user.avatar} alt="" /> : initial}
    </span>
  );
}
