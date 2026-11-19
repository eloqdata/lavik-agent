# 完整原始记录

原始 YCSB 日志、直方图、负载生成命令、采集到的主机状态、实际服务启动命令、配置、失败日志、fio 原始结果及所有复现脚本保存在分片归档中。分片只用于文件传输；重组后 SHA-256 与本地完整归档一致。

在本报告目录运行 `python3 restore.py`，程序校验所有分片及完整归档，然后解压到 `restored/`；不会覆盖已有 `restored/`。需要 Python 3.12 或更新版本。

原始数据位于解压目录中各自的 `client-evidence.tgz` / `server-evidence.tgz`，fio 位于 `qualified-fio/evidence.tgz`。再分别解压到对应结果目录的 `raw/client` 与 `raw/server` 即可运行独立审计脚本。

[分片与完整归档的字节数和 SHA-256](manifest.json)。
