# 多阶段构建：先用 Maven 打包，再用精简 JRE 运行
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
# 预拉依赖，利用层缓存（失败不阻断，离线缺包时由下一步兜底）
RUN mvn -q -B dependency:go-offline || true
COPY src ./src
RUN mvn -q -B clean package -DskipTests

FROM eclipse-temurin:17-jre
WORKDIR /app
# Spring Boot 重打包后 target 下可执行 jar 以 .jar 结尾（原始包为 .jar.original，不会被匹配）
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
