# run 文件夹使用说明

这个文件夹提供一个 Windows 图形化启动器，用来分别启动或关闭仓库里的开发服务。

## 启动方式

双击下面这个文件：

```text
run/launcher.cmd
```

或者在仓库根目录运行：

```bash
npm run run:launcher
```

## 能控制的窗口

- `npm run dev:backend`
- `npm run dev:game`
- `npm run dev:streamer`
- `npm run dev:overlay`
- `npm run dev:viewer`
- `npm run dev:admin`

## 操作方式

- 点击“启动”会在独立窗口打开对应服务。
- 点击“关闭”会关闭对应服务窗口。
- “全部启动”会一次打开所有服务窗口。
- “全部关闭”会一次关闭所有服务窗口。

## 使用建议

- 启动前先确认已经安装依赖。
- 如果某个服务窗口启动失败，先看对应窗口里的报错。
- `game-client` 一般用于主播窗口采集，默认建议和后端一起启动。

## 说明

这个启动器只是一个本地开发工具，不会改后端状态，也不会影响线上配置。
