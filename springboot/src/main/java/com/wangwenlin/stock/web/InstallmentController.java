package com.wangwenlin.stock.web;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.service.InstallmentService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 分期还款路由（6 个）—— 路径与 Node 端 server.js 一一对应，故不设类级前缀。
 * <p>
 * 注意 Node 端的 catch 分支状态码：
 * <ul>
 *   <li>POST / PUT /api/installments：任何异常都回落成 400，故这里把非业务异常也收敛成 400；</li>
 *   <li>DELETE / GET / PUT bills/pay：异常回落成 500，交给全局处理器。</li>
 * </ul>
 */
@RestController
public class InstallmentController {

    private final InstallmentService installmentService;

    public InstallmentController(InstallmentService installmentService) {
        this.installmentService = installmentService;
    }

    @GetMapping("/api/installments/{depositItemId}")
    public Object plan(@PathVariable("depositItemId") String depositItemId) {
        return installmentService.getPlan(depositItemId);
    }

    @PostMapping("/api/installments")
    public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> body) {
        try {
            return installmentService.create(body == null ? Map.of() : body);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(400, message(error));
        }
    }

    @PutMapping("/api/installments/{id}")
    public Map<String, Object> update(@PathVariable("id") String id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        try {
            return installmentService.update(id, body == null ? Map.of() : body);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw new ApiException(400, message(error));
        }
    }

    @DeleteMapping("/api/installments/{id}")
    public Map<String, Object> delete(@PathVariable("id") String id) {
        return installmentService.delete(id);
    }

    @GetMapping("/api/installments/{planId}/bills")
    public List<Map<String, Object>> bills(@PathVariable("planId") String planId) {
        return installmentService.listBills(planId);
    }

    @PutMapping("/api/installments/bills/{id}/pay")
    public Map<String, Object> payBill(@PathVariable("id") String id) {
        return installmentService.payBill(id);
    }

    private static String message(Exception error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }
}
