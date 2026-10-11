// 支流桌面端：壳应用，窗口直接加载远端 https://fenzhi.aimo.plus
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::Manager;

const HOME_URL: &str = "https://fenzhi.aimo.plus";

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // 视图菜单的自定义项（快捷键在这里绑定）
            let reload = MenuItemBuilder::with_id("reload", "刷新")
                .accelerator("CmdOrCtrl+R")
                .build(app)?;
            let hard_reload = MenuItemBuilder::with_id("hard-reload", "强制刷新")
                .accelerator("CmdOrCtrl+Shift+R")
                .build(app)?;
            let back = MenuItemBuilder::with_id("back", "后退")
                .accelerator("CmdOrCtrl+[")
                .build(app)?;
            let forward = MenuItemBuilder::with_id("forward", "前进")
                .accelerator("CmdOrCtrl+]")
                .build(app)?;
            let home = MenuItemBuilder::with_id("home", "回到首页")
                .accelerator("CmdOrCtrl+Shift+H")
                .build(app)?;
            let devtools = MenuItemBuilder::with_id("devtools", "开发者工具")
                .accelerator("CmdOrCtrl+Alt+I")
                .build(app)?;

            // macOS 约定：第一个子菜单是应用菜单
            let app_menu = SubmenuBuilder::new(app, "支流")
                .item(&PredefinedMenuItem::about(app, Some("关于支流"), None)?)
                .separator()
                .item(&PredefinedMenuItem::hide(app, Some("隐藏支流"))?)
                .item(&PredefinedMenuItem::hide_others(app, Some("隐藏其他"))?)
                .item(&PredefinedMenuItem::show_all(app, Some("全部显示"))?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, Some("退出支流"))?)
                .build()?;

            // 编辑菜单必须存在，否则 webview 里 Cmd+C/V 等快捷键不生效
            let edit_menu = SubmenuBuilder::new(app, "编辑")
                .item(&PredefinedMenuItem::undo(app, Some("撤销"))?)
                .item(&PredefinedMenuItem::redo(app, Some("重做"))?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, Some("剪切"))?)
                .item(&PredefinedMenuItem::copy(app, Some("拷贝"))?)
                .item(&PredefinedMenuItem::paste(app, Some("粘贴"))?)
                .item(&PredefinedMenuItem::select_all(app, Some("全选"))?)
                .build()?;

            let view_menu = SubmenuBuilder::new(app, "视图")
                .item(&reload)
                .item(&hard_reload)
                .separator()
                .item(&back)
                .item(&forward)
                .item(&home)
                .separator()
                .item(&PredefinedMenuItem::fullscreen(app, Some("进入全屏"))?)
                .separator()
                .item(&devtools)
                .build()?;

            let window_menu = SubmenuBuilder::new(app, "窗口")
                .item(&PredefinedMenuItem::minimize(app, Some("最小化"))?)
                .item(&PredefinedMenuItem::maximize(app, Some("缩放"))?)
                .separator()
                .item(&PredefinedMenuItem::close_window(app, Some("关闭窗口"))?)
                .build()?;

            let menu = MenuBuilder::new(app)
                .items(&[&app_menu, &edit_menu, &view_menu, &window_menu])
                .build()?;
            app.set_menu(menu)?;

            Ok(())
        })
        .on_menu_event(|app, event| {
            let Some(window) = app.get_webview_window("main") else {
                return;
            };
            match event.id().0.as_str() {
                "reload" => {
                    let _ = window.eval("location.reload()");
                }
                // 保留现有 query（如 /mind?id=），追加时间戳参数绕过缓存
                "hard-reload" => {
                    let _ = window.eval(
                        "const u = new URL(location.href); \
                         u.searchParams.set('_r', Date.now()); \
                         location.href = u.toString();",
                    );
                }
                "back" => {
                    let _ = window.eval("history.back()");
                }
                "forward" => {
                    let _ = window.eval("history.forward()");
                }
                "home" => {
                    let _ = window.eval(&format!("location.href = '{HOME_URL}'"));
                }
                "devtools" => {
                    if window.is_devtools_open() {
                        window.close_devtools();
                    } else {
                        window.open_devtools();
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running 支流");
}
