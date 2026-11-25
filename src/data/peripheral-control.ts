export const peripheralControl = {
  title: '基于 i.MX6ULL 的嵌入式 Linux 外设远程控制与数据采集系统',
  href: '/projects/embedded-linux-peripheral-control/',
  source: 'https://github.com/LoongTittle/embedded-linux-peripheral-control',
  summary: '通过 TCP 将主机命令行连接到 i.MX6ULL 板端服务，实现 LED 远程开关与 AP3216C 三通道数据回传。',
  stack: ['NXP i.MX6ULL', 'Embedded Linux', 'C', 'TCP Socket', 'pthread', 'Linux 设备文件', 'Make', 'ARM 交叉编译'],
  implementation: [
    {
      title: 'TCP 通信与连接管理',
      description: '使用 pthread 为每个客户端连接分配独立线程，将连接接入与命令处理分开。发送端通过循环补发处理 send() 部分写入，接收端识别对端断开并结束会话。',
    },
    {
      title: '命令分发与外设访问',
      description: '将文本命令拆分为参数并分发至对应外设模块。板端通过 Linux 设备文件控制 LED 开关，并读取、回传 AP3216C 的红外、环境光和接近感测数据。',
    },
    {
      title: '主机与板端分离构建',
      description: '使用 Makefile 管理本机 GCC 与 ARM 交叉工具链，分别生成主机客户端和 i.MX6ULL 板端服务程序，并自动跟踪头文件依赖。',
    },
  ],
};
