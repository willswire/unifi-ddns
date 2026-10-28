# Changelog

## [3.4.0](https://github.com/jacanales/unifi-ddns/compare/v3.3.1...v3.4.0) (2026-10-28)


### Features

* add ip6 parameter for dual-stack IPv4/IPv6 updates ([#207](https://github.com/jacanales/unifi-ddns/issues/207)) ([d7f1fd3](https://github.com/jacanales/unifi-ddns/commit/d7f1fd3baa978040da0d605af2e202db0dafdf97))
* add logging ([#117](https://github.com/jacanales/unifi-ddns/issues/117)) ([491325a](https://github.com/jacanales/unifi-ddns/commit/491325a02e8b4c72c9a34091984abeb400f91908))
* added support for ddclient based devices [#8](https://github.com/jacanales/unifi-ddns/issues/8) ([b70c6b9](https://github.com/jacanales/unifi-ddns/commit/b70c6b94c6d4f54edd2cd54bf2674ba00a86ae97))
* added support for ddclient based devices [#8](https://github.com/jacanales/unifi-ddns/issues/8) ([415d7e5](https://github.com/jacanales/unifi-ddns/commit/415d7e51f635a7b2bc49d823376271a53aebd8fa))
* address open community discussions ([#211](https://github.com/jacanales/unifi-ddns/issues/211)) ([78e6816](https://github.com/jacanales/unifi-ddns/commit/78e681642657eef49ae053adfe65da580630a98e))
* automatically use client IP with ip=auto for NAT ([#176](https://github.com/jacanales/unifi-ddns/issues/176)) ([58e4529](https://github.com/jacanales/unifi-ddns/commit/58e452941f796219f7f3e29ff638d184d35d48f6))
* preserve proxy configuration for DNS record ([#105](https://github.com/jacanales/unifi-ddns/issues/105)) ([ac56b89](https://github.com/jacanales/unifi-ddns/commit/ac56b89fd83660efaf92e4667cec59646eae768a))
* refactor ([#94](https://github.com/jacanales/unifi-ddns/issues/94)) ([ed6298e](https://github.com/jacanales/unifi-ddns/commit/ed6298e785ae722e41ab44b71a703d6b8041de66))
* simplify logging & log request ([#118](https://github.com/jacanales/unifi-ddns/issues/118)) ([05eba73](https://github.com/jacanales/unifi-ddns/commit/05eba73323c02f657d81487e8a0d87dd41c23650))


### Bug Fixes

* add missing ttl to dns.records.update call ([#213](https://github.com/jacanales/unifi-ddns/issues/213)) ([0fc35f7](https://github.com/jacanales/unifi-ddns/commit/0fc35f7a15bbfab054043d175e144d20a2a4b59a))
* **ci:** use project wrangler instead of outdated wrangler-action ([#215](https://github.com/jacanales/unifi-ddns/issues/215)) ([04c89d0](https://github.com/jacanales/unifi-ddns/commit/04c89d08f759fa6a162da62f0a0a2b1e63426841))
* **deps:** update all dependencies ([#204](https://github.com/jacanales/unifi-ddns/issues/204)) ([9198755](https://github.com/jacanales/unifi-ddns/commit/91987552c36639c8e8242b0a2009abae653c7a5f))
* **deps:** update all dependencies ([#224](https://github.com/jacanales/unifi-ddns/issues/224)) ([3da8d85](https://github.com/jacanales/unifi-ddns/commit/3da8d85a20a9cd2cf2bda9782576d74f4596500f))
* **dns:** preserve existing record TTL on update ([7012e8b](https://github.com/jacanales/unifi-ddns/commit/7012e8baa54f5e0023d7d96da8067dd05be9c305))
* **dns:** preserve record TTL, add ip6=auto, clarify setup docs ([c857ea8](https://github.com/jacanales/unifi-ddns/commit/c857ea860bbab529354432ad0c2d90e25de7d4c6))
* fix regression that removed support for ddclient-based devices ([#182](https://github.com/jacanales/unifi-ddns/issues/182)) ([31f83ec](https://github.com/jacanales/unifi-ddns/commit/31f83ec03b011cd223c72b6a0675cd162556ae55))
* persist record comments ([#139](https://github.com/jacanales/unifi-ddns/issues/139)) ([10c2772](https://github.com/jacanales/unifi-ddns/commit/10c27721311fe3fbec659915985d088620869bc3))
* remove logs key ([#189](https://github.com/jacanales/unifi-ddns/issues/189)) ([bf3a105](https://github.com/jacanales/unifi-ddns/commit/bf3a1050c3bd535e61a29b71ec4d407321835187))
* return content with successful response ([#100](https://github.com/jacanales/unifi-ddns/issues/100)) ([f716ca7](https://github.com/jacanales/unifi-ddns/commit/f716ca79933e76024a0cca2d79ca437a74fe6563)), closes [#75](https://github.com/jacanales/unifi-ddns/issues/75)
* trim whitespace from query parameters to prevent cryptic errors ([#208](https://github.com/jacanales/unifi-ddns/issues/208)) ([c7a71fc](https://github.com/jacanales/unifi-ddns/commit/c7a71fc3f9298dc5f82b7eec73cb1ad9fbdfdb6a))
* updated badges ([#102](https://github.com/jacanales/unifi-ddns/issues/102)) ([3701f8a](https://github.com/jacanales/unifi-ddns/commit/3701f8ac1a8c6390bf81595ea42ec516aef2bc85))

## [3.3.1](https://github.com/willswire/unifi-ddns/compare/v3.3.0...v3.3.1) (2026-03-04)


### Bug Fixes

* add missing ttl to dns.records.update call ([#213](https://github.com/willswire/unifi-ddns/issues/213)) ([0fc35f7](https://github.com/willswire/unifi-ddns/commit/0fc35f7a15bbfab054043d175e144d20a2a4b59a))
* **ci:** use project wrangler instead of outdated wrangler-action ([#215](https://github.com/willswire/unifi-ddns/issues/215)) ([04c89d0](https://github.com/willswire/unifi-ddns/commit/04c89d08f759fa6a162da62f0a0a2b1e63426841))

## [3.3.0](https://github.com/willswire/unifi-ddns/compare/v3.2.0...v3.3.0) (2026-03-04)


### Features

* address open community discussions ([#211](https://github.com/willswire/unifi-ddns/issues/211)) ([78e6816](https://github.com/willswire/unifi-ddns/commit/78e681642657eef49ae053adfe65da580630a98e))

## [3.2.0](https://github.com/willswire/unifi-ddns/compare/v3.1.1...v3.2.0) (2026-03-04)


### Features

* add ip6 parameter for dual-stack IPv4/IPv6 updates ([#207](https://github.com/willswire/unifi-ddns/issues/207)) ([d7f1fd3](https://github.com/willswire/unifi-ddns/commit/d7f1fd3baa978040da0d605af2e202db0dafdf97))


### Bug Fixes

* **deps:** update all dependencies ([#204](https://github.com/willswire/unifi-ddns/issues/204)) ([9198755](https://github.com/willswire/unifi-ddns/commit/91987552c36639c8e8242b0a2009abae653c7a5f))
* trim whitespace from query parameters to prevent cryptic errors ([#208](https://github.com/willswire/unifi-ddns/issues/208)) ([c7a71fc](https://github.com/willswire/unifi-ddns/commit/c7a71fc3f9298dc5f82b7eec73cb1ad9fbdfdb6a))
