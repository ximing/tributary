import { useRef, useState } from 'react';
import { observer, useService } from '@rabjs/react';
import { ImagePlus, KeyRound } from 'lucide-react';
import { changePassword, removeAvatar, updateProfile, uploadAvatar } from '../api/client.js';
import { UserAvatar } from '../components/UserAvatar.js';
import { SessionService } from '../services/session.service.js';

/** 压缩到 128px 方图，避免把几 MB 的原图塞进数据库 */
function readAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      reject(new Error('只支持 PNG / JPEG / WebP / GIF 图片'));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('浏览器不支持图片处理'));
        return;
      }
      const side = Math.min(image.width, image.height);
      ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败'));
    };
    image.src = url;
  });
}

/** 账号表单草稿留在组件里，提交走 SessionService。 */
export const AccountSection = observer(function AccountSection() {
  const session = useService(SessionService);
  const user = session.user;
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user?.displayName ?? '');
  const [nameMsg, setNameMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [avatarMsg, setAvatarMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [pwdMsg, setPwdMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  const saveAvatar = async (file: File) => {
    setAvatarMsg(null);
    setPending(true);
    try {
      const dataUrl = await readAvatarFile(file);
      const body = await uploadAvatar(dataUrl);
      session.applyUser(body.user);
      setAvatarMsg({ kind: 'ok', text: '头像已更新' });
    } catch (error) {
      setAvatarMsg({ kind: 'err', text: error instanceof Error ? error.message : '上传失败' });
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="account-section">
      <div className="sec-head">
        <h2>账号</h2>
        <p className="section-lede">头像、昵称会显示在侧边栏和设置里；邮箱暂不支持修改。</p>
      </div>

      <div className="profile-card">
        <UserAvatar user={user} size={64} />
        <div className="profile-info">
          <p className="profile-name">{user?.displayName || '未设置昵称'}</p>
          <p className="profile-email">{user?.email}</p>
        </div>
        <div className="profile-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void saveAvatar(file);
            }}
          />
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => fileRef.current?.click()}>
            <ImagePlus size={14} aria-hidden />
            上传头像
          </button>
          {user?.avatar ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pending}
              onClick={() => {
                setPending(true);
                setAvatarMsg(null);
                void removeAvatar()
                  .then(() => session.load())
                  .then(() => {
                    setAvatarMsg({ kind: 'ok', text: '已移除头像' });
                  })
                  .catch((error: unknown) => setAvatarMsg({ kind: 'err', text: error instanceof Error ? error.message : '移除失败' }))
                  .finally(() => setPending(false));
              }}
            >
              移除
            </button>
          ) : null}
        </div>
        {avatarMsg ? (
          <p className={avatarMsg.kind === 'ok' ? 'form-ok' : 'form-error'} role="status">
            {avatarMsg.text}
          </p>
        ) : null}
      </div>

      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          setNameMsg(null);
          void updateProfile({ displayName: name.trim() })
            .then((body) => {
              session.applyUser(body.user);
              setNameMsg({ kind: 'ok', text: '昵称已保存' });
            })
            .catch((error: unknown) => setNameMsg({ kind: 'err', text: error instanceof Error ? error.message : '保存失败' }))
            .finally(() => setPending(false));
        }}
      >
        <h3 className="form-title">昵称</h3>
        <label className="field">
          <span>显示名称</span>
          <input value={name} maxLength={40} placeholder="未设置昵称" onChange={(event) => setName(event.target.value)} />
        </label>
        {nameMsg ? (
          <p className={nameMsg.kind === 'ok' ? 'form-ok' : 'form-error'} role="status">
            {nameMsg.text}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary form-submit" disabled={pending}>
          保存昵称
        </button>
      </form>

      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (pwd.next !== pwd.confirm) {
            setPwdMsg({ kind: 'err', text: '两次输入的新密码不一致' });
            return;
          }
          setPending(true);
          setPwdMsg(null);
          void changePassword({ currentPassword: pwd.current, newPassword: pwd.next })
            .then(() => {
              setPwd({ current: '', next: '', confirm: '' });
              setPwdMsg({ kind: 'ok', text: '密码已更新' });
            })
            .catch((error: unknown) => setPwdMsg({ kind: 'err', text: error instanceof Error ? error.message : '修改失败' }))
            .finally(() => setPending(false));
        }}
      >
        <h3 className="form-title">
          <KeyRound size={15} aria-hidden />
          修改密码
        </h3>
        <label className="field">
          <span>当前密码</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={pwd.current}
            onChange={(event) => setPwd({ ...pwd, current: event.target.value })}
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>新密码</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="至少 8 位"
              value={pwd.next}
              onChange={(event) => setPwd({ ...pwd, next: event.target.value })}
            />
          </label>
          <label className="field">
            <span>确认新密码</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={pwd.confirm}
              onChange={(event) => setPwd({ ...pwd, confirm: event.target.value })}
            />
          </label>
        </div>
        {pwdMsg ? (
          <p className={pwdMsg.kind === 'ok' ? 'form-ok' : 'form-error'} role="status">
            {pwdMsg.text}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary form-submit" disabled={pending}>
          更新密码
        </button>
      </form>
    </section>
  );
});
